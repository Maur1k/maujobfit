import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classifyKeyword,
  readability,
  readabilityScore,
  weightFor,
  type AtsSuggestion,
  type KeywordFinding,
  type RequirementFinding,
} from "@/lib/ats";
import { normaliseSkill } from "@/lib/job-analysis";
import { significantTokens } from "@/lib/matching";
import { captureSnapshot } from "@/lib/versions.functions";

const suggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        kind: z.enum(["add", "rewrite", "trim", "note"]).default("note"),
        target: z.string().default(""),
        suggestion: z.string(),
        grounded_in: z.array(z.string()).default([]),
        rationale: z.string().default(""),
      }),
    )
    .default([]),
});

const SUGGESTION_PROMPT = `You are an ATS reviewer for a candidate's already-validated resume content.
Absolute rules:
- You may ONLY suggest wording that is substantiated by the supplied evidence records. Never suggest adding a skill, tool, employer, metric, certification or experience that is absent from the evidence.
- If a job keyword is missing from the resume but IS present in the evidence, suggest surfacing it and cite the evidence id in grounded_in.
- If a job keyword is missing from BOTH the resume and the evidence, do NOT suggest adding it. You may add one "note" suggestion stating it is a genuine gap the candidate would have to close in reality.
- Never invent numbers. Never soften the truth into something stronger.
- Prefer concrete edits: give the exact replacement sentence in "suggestion", and put the resume line it replaces in "target".
- Keep suggestions to at most 8, ordered by impact.
Return ONLY JSON: {"suggestions":[{"kind":"add|rewrite|trim|note","target":"...","suggestion":"...","grounded_in":["evidence-id"],"rationale":"..."}]}`;

async function callGateway(messages: { role: string; content: string }[]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.7-flash", messages }),
  });
  if (!response.ok) {
    console.error(`AI gateway failed [${response.status}]: ${await response.text()}`);
    return null;
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  const match = /\{[\s\S]*\}/.exec(content);
  return match ? match[0] : null;
}

export const analyzeAtsFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tailoredResumeId: string }) =>
    z.object({ tailoredResumeId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const { data: resume, error: resumeError } = await supabase
      .from("tailored_resumes")
      .select("id, job_id, title, version")
      .eq("id", data.tailoredResumeId)
      .maybeSingle();
    if (resumeError) return fail(resumeError.message);
    if (!resume) return fail("That tailored resume could not be found.");

    const { data: itemRows, error: itemsError } = await supabase
      .from("tailored_resume_items")
      .select("id, section, heading, statement, validation_status, sort_order")
      .eq("tailored_resume_id", resume.id)
      .order("sort_order", { ascending: true });
    if (itemsError) return fail(itemsError.message);
    const supportedItems = (itemRows ?? []).filter((row) => row.validation_status === "supported");
    if (supportedItems.length === 0) {
      return fail(
        "No claim in this resume is validated as supported yet, so there is no application-ready content to score. Validate the resume first, then fix the flagged claims.",
      );
    }

    if (!resume.job_id) return fail("This tailored resume is not linked to a saved job description.");

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, company, seniority, keywords, raw_text, description")
      .eq("id", resume.job_id)
      .maybeSingle();
    if (jobError) return fail(jobError.message);
    if (!job) return fail("The target job description could not be found.");

    const { data: requirementRows, error: reqError } = await supabase
      .from("job_requirements")
      .select("id, requirement, requirement_type, importance, keywords, sort_order")
      .eq("job_id", job.id)
      .order("sort_order", { ascending: true });
    if (reqError) return fail(reqError.message);
    const requirements = requirementRows ?? [];
    if (requirements.length === 0) {
      return fail("This job has no structured requirements yet. Re-run the job analysis, then retry.");
    }

    // ---- Evidence behind the supported claims (the only permitted grounding) ----
    const itemIds = supportedItems.map((row) => row.id);
    const { data: sourceRows, error: sourcesError } = await supabase
      .from("tailored_resume_item_sources")
      .select("tailored_resume_item_id, resume_evidence_id, support_type")
      .eq("user_id", userId)
      .in("tailored_resume_item_id", itemIds);
    if (sourcesError) return fail(sourcesError.message);
    const evidenceIds = [...new Set((sourceRows ?? []).map((row) => row.resume_evidence_id).filter(Boolean))] as string[];
    const { data: evidenceRows, error: evidenceError } = evidenceIds.length
      ? await supabase
          .from("resume_evidence")
          .select("id, category, title, organization, role, start_date, end_date, content, skills")
          .in("id", evidenceIds)
      : { data: [], error: null };
    if (evidenceError) return fail(evidenceError.message);
    const evidence = evidenceRows ?? [];
    const evidenceCorpus = evidence
      .map((row) => [row.title, row.role, row.organization, row.content, (row.skills ?? []).join(" ")].filter(Boolean).join(" "))
      .join("\n");

    // ---- Deterministic keyword coverage ----
    const resumeText = supportedItems
      .map((row) => [row.heading, row.statement].filter(Boolean).join(" — "))
      .join("\n");

    const keywordLabels = [
      ...new Set(
        [...(job.keywords ?? []), ...requirements.flatMap((row) => row.keywords ?? [])]
          .map((label) => String(label ?? "").trim())
          .filter((label) => label.length > 1),
      ),
    ];

    const keywordFindings: KeywordFinding[] = [];
    const seenCanonical = new Set<string>();
    for (const label of keywordLabels) {
      const verdict = classifyKeyword(label, resumeText);
      if (seenCanonical.has(verdict.canonical.toLowerCase())) continue;
      seenCanonical.add(verdict.canonical.toLowerCase());
      const owner = requirements.find((row) => (row.keywords ?? []).some((k: string) => k?.toLowerCase() === label.toLowerCase()));
      keywordFindings.push({
        keyword: label,
        canonical: verdict.canonical,
        status: verdict.status,
        via: verdict.via,
        importance: owner?.importance ?? null,
        requirementType: owner?.requirement_type ?? null,
      });
    }

    const keywordWeighted = keywordFindings.reduce(
      (acc, row) => {
        const weight = weightFor(row.importance);
        acc.total += weight;
        acc.earned += weight * (row.status === "exact" ? 1 : row.status === "related" ? 0.5 : 0);
        return acc;
      },
      { total: 0, earned: 0 },
    );
    const keywordScore = keywordWeighted.total > 0 ? keywordWeighted.earned / keywordWeighted.total : 0;

    // ---- Deterministic requirement coverage ----
    const requirementFindings: RequirementFinding[] = requirements.map((row) => {
      const reqKeywords = (row.keywords ?? []).filter(Boolean) as string[];
      const verdicts = reqKeywords.length
        ? reqKeywords.map((keyword) => classifyKeyword(keyword, resumeText))
        : [classifyKeyword(row.requirement, resumeText)];

      let status: RequirementFinding["status"] = "missing";
      const coveredBy: string[] = [];
      for (const [index, verdict] of verdicts.entries()) {
        const label = reqKeywords[index] ?? row.requirement;
        if (verdict.status === "exact") {
          status = "exact";
          coveredBy.push(label);
        } else if (verdict.status === "related") {
          if (status !== "exact") status = "related";
          coveredBy.push(`${label} (via ${verdict.via.join(", ") || "adjacent evidence"})`);
        }
      }

      // prose requirements with no taxonomy keyword: token overlap against the resume text
      if (status === "missing" && reqKeywords.length === 0) {
        const tokens = significantTokens(row.requirement);
        const haystack = resumeText.toLowerCase();
        const hits = tokens.filter((token) => haystack.includes(token));
        if (tokens.length > 0 && hits.length / tokens.length >= 0.6) {
          status = "exact";
          coveredBy.push(`wording overlap: ${hits.slice(0, 6).join(", ")}`);
        } else if (tokens.length > 0 && hits.length / tokens.length >= 0.3) {
          status = "related";
          coveredBy.push(`partial wording overlap: ${hits.slice(0, 6).join(", ")}`);
        }
      }

      return {
        requirement: row.requirement,
        requirement_type: row.requirement_type ?? null,
        importance: row.importance ?? null,
        status,
        covered_by: coveredBy,
        detail:
          status === "exact"
            ? "Directly addressed by the supported resume content."
            : status === "related"
              ? "Only adjacent content addresses this — it is not an exact match."
              : "Nothing in the supported resume content addresses this requirement.",
      };
    });

    const reqWeighted = requirementFindings.reduce(
      (acc, row) => {
        const weight = weightFor(row.importance);
        acc.total += weight;
        acc.earned += weight * (row.status === "exact" ? 1 : row.status === "related" ? 0.5 : 0);
        return acc;
      },
      { total: 0, earned: 0 },
    );
    const requirementScore = reqWeighted.total > 0 ? reqWeighted.earned / reqWeighted.total : 0;

    // ---- Readability ----
    const readabilityReport = readability(supportedItems.filter((row) => row.section !== "skill").map((row) => row.statement));
    const readScore = readabilityScore(readabilityReport);
    const overall = Number((keywordScore * 0.4 + requirementScore * 0.4 + readScore * 0.2).toFixed(3));

    // ---- Which missing keywords are actually recoverable from stored evidence? ----
    const missing = keywordFindings.filter((row) => row.status === "missing");
    const recoverable = missing.filter((row) => {
      const normalised = normaliseSkill(row.canonical);
      const terms = [normalised.canonical, ...normalised.aliases];
      return terms.some((term) => classifyKeyword(term, evidenceCorpus).status === "exact");
    });

    // ---- Grounded suggestions (AI, with a hard evidence-id guard) ----
    let suggestions: AtsSuggestion[] = [];
    let aiUsed = false;
    if (evidence.length > 0) {
      const raw = await callGateway([
        { role: "system", content: SUGGESTION_PROMPT },
        {
          role: "user",
          content: [
            `Target role: ${[job.title, job.company].filter(Boolean).join(" at ")}`,
            `Missing job keywords: ${missing.map((row) => row.canonical).join(", ") || "none"}`,
            `Missing keywords that DO appear in the evidence (safe to surface): ${recoverable.map((row) => row.canonical).join(", ") || "none"}`,
            `Related-only coverage: ${keywordFindings.filter((row) => row.status === "related").map((row) => `${row.canonical} (via ${row.via.join(", ")})`).join("; ") || "none"}`,
            `Uncovered requirements: ${requirementFindings.filter((row) => row.status !== "exact").map((row) => `${row.requirement} [${row.status}]`).join(" | ") || "none"}`,
            `Readability notes: ${readabilityReport.notes.join(" ") || "none"}`,
            "",
            "Current supported resume lines:",
            ...supportedItems.map((row) => `- [${row.section}] ${row.heading ? `${row.heading}: ` : ""}${row.statement}`),
            "",
            "Evidence records (the ONLY permitted source of facts):",
            ...evidence.map((row) => `- id=${row.id} | ${[row.role, row.organization, row.title].filter(Boolean).join(" · ")} | ${row.content} | skills: ${(row.skills ?? []).join(", ")}`),
          ].join("\n"),
        },
      ]).catch(() => null);

      if (raw) {
        try {
          const parsed = suggestionSchema.parse(JSON.parse(raw));
          const validEvidence = new Set(evidence.map((row) => row.id));
          suggestions = parsed.suggestions
            .map((row) => ({
              kind: row.kind,
              target: row.target.trim(),
              suggestion: row.suggestion.trim(),
              grounded_in: row.grounded_in.filter((id) => validEvidence.has(id)),
              rationale: row.rationale.trim(),
            }))
            .filter((row) => row.suggestion.length > 0)
            // an add/rewrite must cite real stored evidence; otherwise it is ungrounded and dropped
            .filter((row) => row.kind === "note" || row.kind === "trim" || row.grounded_in.length > 0);
          aiUsed = true;
        } catch {
          suggestions = [];
        }
      }
    }

    if (suggestions.length === 0) {
      suggestions = [
        ...recoverable.map((row) => ({
          kind: "add" as const,
          target: "Supported resume content",
          suggestion: `Surface "${row.canonical}" explicitly — your stored evidence already demonstrates it, but the current wording never names it.`,
          grounded_in: evidence
            .filter((record) =>
              classifyKeyword(row.canonical, [record.title, record.role, record.organization, record.content, (record.skills ?? []).join(" ")].filter(Boolean).join(" ")).status === "exact",
            )
            .map((record) => record.id),
          rationale: "The keyword is present in your evidence, so naming it adds no unsupported claim.",
        })),
        ...readabilityReport.notes.map((note) => ({
          kind: "note" as const,
          target: "Readability",
          suggestion: note,
          grounded_in: [],
          rationale: "Deterministic readability check.",
        })),
        ...missing
          .filter((row) => !recoverable.some((candidate) => candidate.canonical === row.canonical))
          .slice(0, 6)
          .map((row) => ({
            kind: "note" as const,
            target: row.canonical,
            suggestion: `"${row.canonical}" is a genuine gap: it appears in the job but in neither your resume nor your stored evidence. Do not add it — close it in reality first.`,
            grounded_in: [],
            rationale: "No stored evidence substantiates this keyword.",
          })),
      ];
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ats_analyses")
      .insert({
        user_id: userId,
        tailored_resume_id: resume.id,
        job_id: job.id,
        overall_score: overall,
        keyword_score: Number(keywordScore.toFixed(3)),
        requirement_score: Number(requirementScore.toFixed(3)),
        readability_score: readScore,
        matched_keywords: keywordFindings.filter((row) => row.status === "exact").map((row) => row.canonical),
        related_keywords: keywordFindings.filter((row) => row.status === "related").map((row) => `${row.canonical} (via ${row.via.join(", ")})`),
        missing_keywords: missing.map((row) => row.canonical),
        requirement_findings: requirementFindings,
        readability: { ...readabilityReport, keywords: keywordFindings },
        suggestions,
        analysed_items: supportedItems.length,
        ai_used: aiUsed,
      })
      .select("id")
      .maybeSingle();
    if (insertError) return fail(insertError.message);

    try {
      await captureSnapshot({ supabase, userId }, {
        tailoredResumeId: resume.id,
        reason: "manual",
        label: `v${resume.version} · ATS analysis`,
        notes: `ATS analysis scored ${Math.round(overall * 100)}%.`,
      });
    } catch {
      // history capture is best-effort; the analysis itself is already saved
    }

    return {
      ok: true as const,
      analysisId: inserted?.id ?? null,
      overall,
      keywordScore: Number(keywordScore.toFixed(3)),
      requirementScore: Number(requirementScore.toFixed(3)),
      readabilityScore: readScore,
      aiUsed,
      suggestionCount: suggestions.length,
    };
  });
