import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evidenceCanonicalSkills,
  matchProseRequirement,
  matchSkillRequirement,
  type EvidenceRow,
  type MatchVerdict,
} from "@/lib/matching";

const EVIDENCE_COLUMNS =
  "id, category, title, organization, role, content, skills, evidence_kind, source_reference";

const aiSchema = z.object({
  results: z
    .array(
      z.object({
        requirement_index: z.number(),
        status: z.enum(["exact", "related", "missing"]),
        evidence_ids: z.array(z.string()).default([]),
        rationale: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.5),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = `You judge whether a candidate's resume evidence supports each job requirement.
Rules:
- Use ONLY the evidence provided. Never invent evidence, ids, or experience.
- "exact": an evidence record explicitly names or clearly covers the requirement.
- "related": evidence is adjacent but not identical (e.g. Laravel/PHP experience for a Node.js requirement).
- "missing": no evidence supports it — evidence_ids MUST be empty.
- Cite only ids listed in the evidence block; at most 3 per requirement.
- rationale: one short sentence, referencing the cited evidence, no praise, no invention.
- confidence: 0..1 for how sure you are of the status.
Return ONLY JSON: {"results":[{"requirement_index":0,"status":"exact","evidence_ids":["..."],"rationale":"...","confidence":0.8}]}`;

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response was not valid JSON.");
  return body.slice(start, end + 1);
}

function evidenceLine(row: EvidenceRow) {
  const header = [row.role, row.title, row.organization].filter(Boolean).join(" — ");
  const skills = row.skills.length > 0 ? ` [skills: ${row.skills.join(", ")}]` : "";
  return `- id=${row.id} (${row.category}) ${header}: ${row.content.slice(0, 400)}${skills}`;
}

export const computeJobMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: job, error: jobError }, { data: requirements, error: reqError }] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, analysis_status")
        .eq("id", data.jobId)
        .maybeSingle(),
      supabase
        .from("job_requirements")
        .select("id, requirement, requirement_type, canonical_skill, sort_order")
        .eq("job_id", data.jobId)
        .order("sort_order", { ascending: true }),
    ]);
    if (jobError) return { ok: false as const, error: jobError.message };
    if (reqError) return { ok: false as const, error: reqError.message };
    if (!job) return { ok: false as const, error: "That job could not be found." };
    if (!requirements || requirements.length === 0) {
      return {
        ok: false as const,
        error: "This job has no structured requirements yet. Analyze the posting first.",
      };
    }

    const { data: resumes, error: resumeError } = await supabase
      .from("master_resumes")
      .select("id, title, is_primary, created_at")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (resumeError) return { ok: false as const, error: resumeError.message };
    const resume = resumes?.[0];
    if (!resume) {
      return {
        ok: false as const,
        error: "You don't have a master resume yet. Build or import one before matching.",
      };
    }

    const { data: evidenceData, error: evidenceError } = await supabase
      .from("resume_evidence")
      .select(EVIDENCE_COLUMNS)
      .eq("master_resume_id", resume.id)
      .order("sort_order", { ascending: true });
    if (evidenceError) return { ok: false as const, error: evidenceError.message };
    const evidence = (evidenceData ?? []) as EvidenceRow[];
    if (evidence.length === 0) {
      return {
        ok: false as const,
        error: "Your master resume has no evidence records yet. Add entries before matching.",
      };
    }

    const evidenceById = new Map(evidence.map((row) => [row.id, row]));
    const evidenceSkills = new Map(evidence.map((row) => [row.id, evidenceCanonicalSkills(row)]));

    const verdicts = new Map<string, MatchVerdict>();
    const prose: { index: number; id: string; requirement: string }[] = [];

    for (const requirement of requirements) {
      const type = requirement.requirement_type ?? "";
      if (type === "required_skill" || type === "preferred_skill") {
        verdicts.set(
          requirement.id,
          matchSkillRequirement(requirement.requirement, evidence, evidenceSkills),
        );
      } else {
        prose.push({ index: prose.length, id: requirement.id, requirement: requirement.requirement });
      }
    }

    let aiUsed = false;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (prose.length > 0 && apiKey) {
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
                content: `Resume evidence:\n${evidence.map(evidenceLine).join("\n")}\n\nRequirements:\n${prose
                  .map((item) => `${item.index}. ${item.requirement}`)
                  .join("\n")}`,
              },
            ],
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
          const parsed = aiSchema.parse(JSON.parse(stripFence(payload.choices?.[0]?.message?.content ?? "")));
          for (const result of parsed.results) {
            const item = prose.find((entry) => entry.index === result.requirement_index);
            if (!item) continue;
            const ids = result.evidence_ids.filter((id) => evidenceById.has(id)).slice(0, 3);
            const status = result.status === "missing" || ids.length === 0 ? "missing" : result.status;
            verdicts.set(item.id, {
              status,
              evidenceIds: status === "missing" ? [] : ids,
              rationale:
                result.rationale.trim() ||
                (status === "missing" ? "No supporting evidence found." : "Supported by the cited evidence."),
              confidence: result.confidence,
            });
          }
          aiUsed = true;
        }
      } catch {
        aiUsed = false;
      }
    }

    for (const item of prose) {
      if (!verdicts.has(item.id)) verdicts.set(item.id, matchProseRequirement(item.requirement, evidence));
    }

    const rows: {
      user_id: string;
      job_id: string;
      master_resume_id: string;
      job_requirement_id: string;
      resume_evidence_id: string | null;
      status: string;
      coverage: string;
      score: number;
      rationale: string;
      evidence_excerpt: string | null;
    }[] = [];

    for (const requirement of requirements) {
      const verdict = verdicts.get(requirement.id)!;
      const base = {
        user_id: userId,
        job_id: data.jobId,
        master_resume_id: resume.id,
        job_requirement_id: requirement.id,
        status: verdict.status,
        coverage: verdict.status,
        score: Number(verdict.confidence.toFixed(2)),
        rationale: verdict.rationale,
      };
      if (verdict.status === "missing" || verdict.evidenceIds.length === 0) {
        rows.push({ ...base, resume_evidence_id: null, evidence_excerpt: null });
        continue;
      }
      for (const evidenceId of verdict.evidenceIds) {
        rows.push({
          ...base,
          resume_evidence_id: evidenceId,
          evidence_excerpt: evidenceById.get(evidenceId)?.content.slice(0, 500) ?? null,
        });
      }
    }

    await supabase.from("match_results").delete().eq("job_id", data.jobId);
    const { error: insertError } = await supabase.from("match_results").insert(rows);
    if (insertError) return { ok: false as const, error: insertError.message };

    return {
      ok: true as const,
      jobId: data.jobId,
      masterResumeId: resume.id,
      requirementCount: requirements.length,
      rowCount: rows.length,
      aiUsed,
    };
  });
