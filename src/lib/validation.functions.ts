import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capStatus,
  containsMetric,
  metricTokens,
  normaliseForCompare,
  overlapRatio,
  severityFor,
  type ValidationStatus,
} from "@/lib/validation";

const aiSchema = z.object({
  results: z
    .array(
      z.object({
        index: z.number(),
        status: z.enum(["supported", "partially_supported", "unsupported", "needs_review"]),
        rationale: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.5),
        unsupported_spans: z.array(z.string()).default([]),
        issues: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = `You are a strict claim validator for resumes. You judge ONLY whether each claim is substantiated by the evidence excerpts supplied with it.
Rules:
- Never assume, infer or fabricate support. If the evidence does not state it, it is not supported.
- A citation existing is NOT support. The evidence must substantiate the exact wording, scope, metric, technology, employer/project and timeframe of the claim.
- supported: every factual element of the claim appears in the evidence.
- partially_supported: the core is in the evidence but some element (a metric, a scope word, a technology, a timeframe) is not.
- unsupported: the claim's central fact is absent from the evidence, or the evidence describes something different.
- needs_review: the evidence is too vague or ambiguous to decide.
- unsupported_spans: quote verbatim only the substrings of the claim that the evidence does not substantiate.
- issues: choose from missing_citation, invalid_citation, unsupported_metric, unsupported_span, altered_fact, timeframe_mismatch, overstatement.
- Skill claims are supported only if the skill is named in the evidence.
Return ONLY JSON: {"results":[{"index":0,"status":"supported","rationale":"","confidence":0.9,"unsupported_spans":[],"issues":[]}]}`;

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response was not valid JSON.");
  return body.slice(start, end + 1);
}

type EvidenceRecord = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  content: string;
  skills: string[];
};

function evidenceText(row: EvidenceRecord) {
  return [row.role, row.title, row.organization, row.start_date, row.end_date, row.content, row.skills.join(", ")]
    .filter(Boolean)
    .join(" | ");
}

export const validateTailoredResume = createServerFn({ method: "POST" })
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
      .select("id, section, heading, statement, source_text, sort_order")
      .eq("tailored_resume_id", resume.id)
      .order("sort_order", { ascending: true });
    if (itemsError) return fail(itemsError.message);
    const items = itemRows ?? [];
    if (items.length === 0) return fail("This tailored resume has no items to validate yet.");

    const { data: sourceRows, error: sourcesError } = await supabase
      .from("tailored_resume_item_sources")
      .select("id, tailored_resume_item_id, resume_evidence_id, support_type, excerpt")
      .in(
        "tailored_resume_item_id",
        items.map((row) => row.id),
      );
    if (sourcesError) return fail(sourcesError.message);
    const sources = sourceRows ?? [];

    const evidenceIds = [...new Set(sources.map((row) => row.resume_evidence_id).filter(Boolean))] as string[];
    const { data: evidenceRows, error: evidenceError } = evidenceIds.length
      ? await supabase
          .from("resume_evidence")
          .select("id, category, title, organization, role, start_date, end_date, content, skills")
          .in("id", evidenceIds)
      : { data: [], error: null };
    if (evidenceError) return fail(evidenceError.message);
    const evidenceById = new Map(((evidenceRows ?? []) as EvidenceRecord[]).map((row) => [row.id, row]));

    type Assessment = {
      itemId: string;
      statement: string;
      ceiling: ValidationStatus;
      status: ValidationStatus;
      rationale: string;
      confidence: number;
      issues: string[];
      spans: string[];
      evidenceIds: string[];
      excerpts: string[];
      validator: string;
    };

    const assessments: Assessment[] = [];
    const aiCandidates: { index: number; assessmentIndex: number; prompt: string }[] = [];

    items.forEach((item) => {
      const itemSources = sources.filter((row) => row.tailored_resume_item_id === item.id);
      const cited = itemSources
        .map((row) => (row.resume_evidence_id ? evidenceById.get(row.resume_evidence_id) : undefined))
        .filter(Boolean) as EvidenceRecord[];
      const issues: string[] = [];
      const spans: string[] = [];
      let ceiling: ValidationStatus = "supported";

      if (itemSources.length === 0) {
        issues.push("missing_citation");
        ceiling = "unsupported";
      } else if (cited.length < itemSources.length) {
        issues.push("invalid_citation");
        ceiling = cited.length === 0 ? "unsupported" : "partially_supported";
      }

      const corpus = [...cited.map(evidenceText), item.source_text ?? "", ...itemSources.map((row) => row.excerpt ?? "")]
        .filter(Boolean)
        .join("\n");

      const unmatchedMetrics = metricTokens(item.statement).filter((metric) => !containsMetric(corpus, metric));
      if (unmatchedMetrics.length > 0) {
        issues.push("unsupported_metric");
        spans.push(...unmatchedMetrics);
        ceiling = capStatus(ceiling, "unsupported");
      }

      if (item.heading) {
        const headingParts = item.heading
          .split(/[—|,–-]/)
          .map((part) => part.trim())
          .filter((part) => part.length > 2);
        const missingParts = headingParts.filter(
          (part) => !normaliseForCompare(corpus).includes(normaliseForCompare(part)),
        );
        if (missingParts.length > 0) {
          issues.push("altered_fact");
          spans.push(...missingParts);
          ceiling = capStatus(ceiling, "partially_supported");
        }
      }

      const ratio = corpus ? overlapRatio(item.statement, corpus) : 0;
      if (corpus && ratio < 0.35) {
        issues.push("weak_overlap");
        ceiling = capStatus(ceiling, "needs_review");
      }

      const assessment: Assessment = {
        itemId: item.id,
        statement: item.statement,
        ceiling,
        status: ceiling === "supported" ? (ratio >= 0.7 ? "supported" : "partially_supported") : ceiling,
        rationale:
          itemSources.length === 0
            ? "No citation is stored for this claim, so nothing substantiates it."
            : `Deterministic check: ${Math.round(ratio * 100)}% of the claim's wording traces back to the cited evidence.`,
        confidence: 0.4,
        issues: [...new Set(issues)],
        spans: [...new Set(spans)],
        evidenceIds: cited.map((row) => row.id),
        excerpts: cited.map((row) => row.content.slice(0, 400)),
        validator: "deterministic",
      };
      assessments.push(assessment);

      if (cited.length > 0) {
        aiCandidates.push({
          index: aiCandidates.length,
          assessmentIndex: assessments.length - 1,
          prompt: `#${aiCandidates.length} [${item.section}]${item.heading ? ` heading: ${item.heading}` : ""}\nclaim: ${item.statement}\nevidence:\n${cited
            .map((row) => `  - ${evidenceText(row)}`)
            .join("\n")}`,
        });
      }
    });

    let aiUsed = false;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey && aiCandidates.length > 0) {
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.7-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Validate each claim against ONLY its own evidence.\n\n${aiCandidates
                  .map((row) => row.prompt)
                  .join("\n\n")}`,
              },
            ],
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
          const parsed = aiSchema.parse(JSON.parse(stripFence(payload.choices?.[0]?.message?.content ?? "")));
          aiUsed = true;
          for (const result of parsed.results) {
            const candidate = aiCandidates.find((row) => row.index === result.index);
            if (!candidate) continue;
            const target = assessments[candidate.assessmentIndex]!;
            const statement = target.statement.toLowerCase();
            const verifiedSpans = result.unsupported_spans
              .map((span) => span.trim())
              .filter((span) => span.length > 0 && statement.includes(span.toLowerCase()));
            target.status = capStatus(result.status, target.ceiling);
            target.rationale = result.rationale.trim() || target.rationale;
            target.confidence = Number(result.confidence.toFixed(2));
            target.spans = [...new Set([...target.spans, ...verifiedSpans])];
            target.issues = [
              ...new Set([
                ...target.issues,
                ...result.issues.filter((issue) => /^[a-z_]+$/.test(issue)),
                ...(target.status !== "supported" && verifiedSpans.length > 0 ? ["unsupported_span"] : []),
              ]),
            ];
            target.validator = "ai+deterministic";
          }
        }
      } catch {
        aiUsed = false;
      }
    }

    if (!aiUsed) {
      for (const assessment of assessments) {
        if (assessment.evidenceIds.length > 0) {
          assessment.status = capStatus("needs_review", assessment.ceiling);
          assessment.issues = [...new Set([...assessment.issues, "ai_unavailable"])];
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("validation_results")
      .delete()
      .eq("tailored_resume_id", resume.id);
    if (deleteError) return fail(deleteError.message);

    const { error: insertError } = await supabase.from("validation_results").insert(
      assessments.map((assessment) => ({
        user_id: userId,
        tailored_resume_id: resume.id,
        tailored_resume_item_id: assessment.itemId,
        check_type: "claim_support",
        severity: severityFor(assessment.status),
        passed: assessment.status === "supported",
        message: assessment.rationale,
        status: assessment.status,
        rationale: assessment.rationale,
        confidence: assessment.confidence,
        evidence_ids: assessment.evidenceIds,
        evidence_excerpts: assessment.excerpts,
        unsupported_spans: assessment.spans,
        issues: assessment.issues,
        validator: assessment.validator,
      })),
    );
    if (insertError) return fail(insertError.message);

    for (const assessment of assessments) {
      const { error } = await supabase
        .from("tailored_resume_items")
        .update({ validation_status: assessment.status })
        .eq("id", assessment.itemId);
      if (error) return fail(error.message);
    }

    const counts = assessments.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true as const,
      tailoredResumeId: resume.id,
      checked: assessments.length,
      aiUsed,
      counts,
    };
  });
