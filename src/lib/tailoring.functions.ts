import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseSkill } from "@/lib/job-analysis";

const generatedSchema = z.object({
  summary: z.object({
    statement: z.string(),
    evidence_ids: z.array(z.string()).default([]),
    rationale: z.string().default(""),
    confidence: z.number().min(0).max(1).default(0.6),
  }),
  experience: z
    .array(
      z.object({
        heading: z.string().default(""),
        statement: z.string(),
        evidence_ids: z.array(z.string()).default([]),
        rationale: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.6),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        heading: z.string().default(""),
        statement: z.string(),
        evidence_ids: z.array(z.string()).default([]),
        rationale: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.6),
      }),
    )
    .default([]),
  skills: z
    .array(
      z.object({
        name: z.string(),
        evidence_ids: z.array(z.string()).default([]),
        rationale: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.6),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = `You rewrite a candidate's OWN evidence into a resume tailored to a specific job.
Absolute rules:
- Every statement must be traceable to the supplied evidence records. Never invent employers, tools, metrics, dates or achievements.
- Never claim a skill or requirement that has no supplied evidence. Requirements marked missing are deliberately absent — ignore them entirely.
- Evidence marked "related" is adjacent, NOT equivalent: describe it in the candidate's actual terms (e.g. keep "Laravel/PHP" as-is), never restate it as the job's term.
- Reuse the evidence's own facts and numbers; you may compress and reorder wording only.
- Every item must cite at least one evidence id from the supplied list; items you cannot ground must be omitted.
- Order items by relevance to the required skills and responsibilities.
- summary: 2-3 sentences, first person implied (no "I"), grounded in the evidence.
- experience/projects: one achievement per item, one sentence, strong verb first, heading = "Role — Organization" or the project name exactly as in the evidence.
- skills: only skills that appear in the evidence, prioritising ones the job asks for.
Return ONLY JSON:
{"summary":{"statement":"","evidence_ids":[],"rationale":"","confidence":0.8},"experience":[{"heading":"","statement":"","evidence_ids":[],"rationale":"","confidence":0.8}],"projects":[],"skills":[{"name":"","evidence_ids":[],"rationale":"","confidence":0.8}]}`;

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

export const generateTailoredResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const [{ data: job, error: jobError }, { data: requirements, error: reqError }, { data: matches, error: matchError }] =
      await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, company, seniority, employment_type, analysis_status")
          .eq("id", data.jobId)
          .maybeSingle(),
        supabase
          .from("job_requirements")
          .select("id, requirement, requirement_type, sort_order")
          .eq("job_id", data.jobId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("match_results")
          .select("job_requirement_id, resume_evidence_id, status, score, rationale, master_resume_id")
          .eq("job_id", data.jobId),
      ]);
    if (jobError) return fail(jobError.message);
    if (reqError) return fail(reqError.message);
    if (matchError) return fail(matchError.message);
    if (!job) return fail("That job could not be found.");
    if (!requirements || requirements.length === 0) {
      return fail("This job has no structured requirements yet. Analyze the posting first.");
    }
    if (!matches || matches.length === 0) {
      return fail("No match report exists for this job yet. Run the match report first.");
    }

    const masterResumeId = matches.find((row) => row.master_resume_id)?.master_resume_id ?? null;
    if (!masterResumeId) {
      return fail("The match report has no master resume attached. Re-run the match report.");
    }

    const requirementById = new Map(requirements.map((row) => [row.id, row]));
    const supporting = matches.filter(
      (row) => row.resume_evidence_id && (row.status === "exact" || row.status === "related"),
    );
    if (supporting.length === 0) {
      return fail(
        "The match report found no supporting evidence for this job, so there is nothing to tailor. Add evidence to your master resume and re-run the match.",
      );
    }

    const evidenceIds = [...new Set(supporting.map((row) => row.resume_evidence_id!))];
    const { data: evidenceData, error: evidenceError } = await supabase
      .from("resume_evidence")
      .select("id, category, title, organization, role, start_date, end_date, content, skills")
      .in("id", evidenceIds)
      .order("sort_order", { ascending: true });
    if (evidenceError) return fail(evidenceError.message);
    const evidence = (evidenceData ?? []) as EvidenceRecord[];
    if (evidence.length === 0) return fail("The cited evidence records no longer exist. Re-run the match report.");
    const evidenceById = new Map(evidence.map((row) => [row.id, row]));

    // exact-supported evidence first, then related-only evidence
    const statusFor = new Map<string, "exact" | "related">();
    const supportedRequirements = new Map<string, Set<string>>();
    for (const row of supporting) {
      const id = row.resume_evidence_id!;
      if (row.status === "exact") statusFor.set(id, "exact");
      else if (!statusFor.has(id)) statusFor.set(id, "related");
      const requirement = row.job_requirement_id ? requirementById.get(row.job_requirement_id) : null;
      if (requirement) {
        const set = supportedRequirements.get(id) ?? new Set<string>();
        set.add(`${requirement.requirement} (${row.status})`);
        supportedRequirements.set(id, set);
      }
    }
    const ordered = [...evidence].sort((a, b) => {
      const rank = (id: string) => (statusFor.get(id) === "exact" ? 0 : 1);
      return rank(a.id) - rank(b.id);
    });

    const evidenceBlock = ordered
      .map((row) => {
        const header = [row.role, row.title, row.organization].filter(Boolean).join(" — ");
        const dates = [row.start_date, row.end_date].filter(Boolean).join(" – ");
        const skills = row.skills.length > 0 ? ` | skills: ${row.skills.join(", ")}` : "";
        const supports = [...(supportedRequirements.get(row.id) ?? [])].join("; ");
        return `- id=${row.id} | match=${statusFor.get(row.id)} | ${row.category} | ${header}${dates ? ` (${dates})` : ""}${skills}\n  text: ${row.content}\n  supports: ${supports || "general relevance"}`;
      })
      .join("\n");

    const requirementBlock = requirements
      .map((row) => `- [${row.requirement_type}] ${row.requirement}`)
      .join("\n");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return fail("AI generation is not configured for this project.");

    let generated: z.infer<typeof generatedSchema>;
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
              content: `Target role: ${job.title}${job.company ? ` at ${job.company}` : ""}${job.seniority ? ` (${job.seniority})` : ""}\n\nStructured job requirements:\n${requirementBlock}\n\nApproved evidence (the ONLY permitted source of facts):\n${evidenceBlock}`,
            },
          ],
        }),
      });
      if (response.status === 429) return fail("The AI service is rate limited right now. Wait a moment and retry.");
      if (response.status === 402 || response.status === 403) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        return fail(
          body?.error?.message ??
            "AI generation is unavailable for this workspace right now. Check your Lovable AI credits and retry.",
        );
      }
      if (!response.ok) return fail("The AI service could not generate a tailored resume. Please retry.");
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      generated = generatedSchema.parse(JSON.parse(stripFence(payload.choices?.[0]?.message?.content ?? "")));
    } catch {
      return fail("We couldn't generate a tailored resume from this evidence. Please retry.");
    }

    type Draft = {
      section: string;
      heading: string | null;
      statement: string;
      rationale: string;
      confidence: number;
      evidenceIds: string[];
    };

    const clean = (ids: string[]) => [...new Set(ids.filter((id) => evidenceById.has(id)))].slice(0, 4);
    const drafts: Draft[] = [];

    const summaryIds = clean(generated.summary.evidence_ids);
    if (generated.summary.statement.trim() && summaryIds.length > 0) {
      drafts.push({
        section: "summary",
        heading: null,
        statement: generated.summary.statement.trim(),
        rationale: generated.summary.rationale.trim() || "Composed from the cited evidence records.",
        confidence: generated.summary.confidence,
        evidenceIds: summaryIds,
      });
    }

    for (const [section, items] of [
      ["experience", generated.experience],
      ["project", generated.projects],
    ] as const) {
      for (const item of items) {
        const ids = clean(item.evidence_ids);
        if (!item.statement.trim() || ids.length === 0) continue;
        drafts.push({
          section,
          heading: item.heading.trim() || null,
          statement: item.statement.trim(),
          rationale: item.rationale.trim() || "Derived from the cited evidence.",
          confidence: item.confidence,
          evidenceIds: ids,
        });
      }
    }

    const evidenceSkillSet = new Set<string>();
    for (const row of evidence) {
      for (const skill of row.skills) evidenceSkillSet.add(normaliseSkill(skill).canonical.toLowerCase());
    }
    for (const skill of generated.skills) {
      const name = skill.name.trim();
      const ids = clean(skill.evidence_ids);
      if (!name || ids.length === 0) continue;
      const canonical = normaliseSkill(name).canonical.toLowerCase();
      const inEvidenceText = ids.some((id) =>
        evidenceById.get(id)!.content.toLowerCase().includes(name.toLowerCase()),
      );
      if (!evidenceSkillSet.has(canonical) && !inEvidenceText) continue;
      drafts.push({
        section: "skill",
        heading: null,
        statement: name,
        rationale: skill.rationale.trim() || "Named in the cited evidence.",
        confidence: skill.confidence,
        evidenceIds: ids,
      });
    }

    if (drafts.length === 0) {
      return fail("The generated draft could not be grounded in your evidence. Please retry the generation.");
    }

    const { data: previous } = await supabase
      .from("tailored_resumes")
      .select("version")
      .eq("job_id", data.jobId)
      .order("version", { ascending: false })
      .limit(1);
    const version = (previous?.[0]?.version ?? 0) + 1;

    const exactCount = requirements.filter((requirement) =>
      matches.some((row) => row.job_requirement_id === requirement.id && row.status === "exact"),
    ).length;
    const relatedCount = requirements.filter((requirement) =>
      matches.some((row) => row.job_requirement_id === requirement.id && row.status === "related"),
    ).length;
    const coverage = requirements.length > 0 ? (exactCount + relatedCount * 0.5) / requirements.length : 0;

    const { data: resume, error: resumeError } = await supabase
      .from("tailored_resumes")
      .insert({
        user_id: userId,
        job_id: data.jobId,
        master_resume_id: masterResumeId,
        title: `${job.title}${job.company ? ` — ${job.company}` : ""} (v${version})`,
        status: "draft",
        generation_status: "ready",
        version,
        match_score: Number(coverage.toFixed(2)),
        evidence_coverage: Number((requirements.length ? exactCount / requirements.length : 0).toFixed(2)),
        notes: "Generated from evidence only. All items are pending evidence validation.",
      })
      .select("id")
      .single();
    if (resumeError || !resume) return fail(resumeError?.message ?? "Could not save the tailored resume.");

    const { data: insertedItems, error: itemsError } = await supabase
      .from("tailored_resume_items")
      .insert(
        drafts.map((draft, index) => ({
          user_id: userId,
          tailored_resume_id: resume.id,
          section: draft.section,
          heading: draft.heading,
          statement: draft.statement,
          sort_order: index,
          is_evidence_backed: true,
          validation_status: "pending",
          rationale: draft.rationale,
          confidence: Number(draft.confidence.toFixed(2)),
          source_text: evidenceById.get(draft.evidenceIds[0]!)?.content.slice(0, 800) ?? null,
        })),
      )
      .select("id, sort_order");
    if (itemsError || !insertedItems) return fail(itemsError?.message ?? "Could not save the generated items.");

    const idBySort = new Map(insertedItems.map((row) => [row.sort_order, row.id]));
    const sources = drafts.flatMap((draft, index) =>
      draft.evidenceIds.map((evidenceId) => ({
        user_id: userId,
        tailored_resume_item_id: idBySort.get(index)!,
        resume_evidence_id: evidenceId,
        support_type: statusFor.get(evidenceId) === "exact" ? "primary" : "related",
        confidence: Number(draft.confidence.toFixed(2)),
        excerpt: evidenceById.get(evidenceId)?.content.slice(0, 500) ?? null,
      })),
    );
    const { error: sourcesError } = await supabase.from("tailored_resume_item_sources").insert(sources);
    if (sourcesError) return fail(sourcesError.message);

    return {
      ok: true as const,
      tailoredResumeId: resume.id,
      version,
      itemCount: drafts.length,
      sourceCount: sources.length,
    };
  });
