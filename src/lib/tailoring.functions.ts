import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadJobComposition, persistPriorities, type CompositionEvidence } from "@/lib/composition.functions";
import { PRIORITY_RANK, type CandidateResult, type CompositionPriority } from "@/lib/composition";
import {
  compositionBudget,
  normaliseSettings,
  resumeLengthLabel,
  skillsScopeLabel,
  tailoringLevelLabel,
  type TailoringSettings,
} from "@/lib/tailoring-settings";
import { TAILORED_SECTION_ORDER } from "@/lib/tailoring";

const generatedSchema = z.object({
  summary: z
    .object({
      statement: z.string().default(""),
      evidence_ids: z.array(z.string()).default([]),
      rationale: z.string().default(""),
      confidence: z.number().min(0).max(1).default(0.6),
    })
    .default({ statement: "", evidence_ids: [], rationale: "", confidence: 0.6 }),
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
});

const SYSTEM_PROMPT = `You compose a candidate's OWN evidence into a resume tailored to a specific job.
Absolute rules:
- Every statement must be traceable to the supplied evidence records. Never invent employers, tools, metrics, dates or achievements.
- Never claim a skill or requirement that has no supplied evidence.
- Evidence marked priority=high directly answers the posting: lead with it and emphasise the job-relevant technologies already present in it.
- Evidence marked priority=supporting or priority=low is real, transferable experience: KEEP it, described in the candidate's own terms. Do not drop an entry just because it lacks the job's exact keywords.
- Reuse the evidence's own facts and numbers; you may compress and reorder wording only.
- Every item must cite at least one evidence id from the supplied list; items you cannot ground must be omitted.
- Cover EVERY listed experience group and EVERY listed project group that appears in the catalogue, in the order given.
- experience/projects: one achievement per item, one sentence, strong verb first, heading must be copied EXACTLY from the group's "group:" label.
- summary: grounded in the summary evidence and the highest priority experience.
Return ONLY JSON:
{"summary":{"statement":"","evidence_ids":[],"rationale":"","confidence":0.8},"experience":[{"heading":"","statement":"","evidence_ids":[],"rationale":"","confidence":0.8}],"projects":[]}`;

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response was not valid JSON.");
  return body.slice(start, end + 1);
}

type Draft = {
  section: string;
  heading: string | null;
  statement: string;
  rationale: string;
  confidence: number;
  evidenceIds: string[];
  priority: CompositionPriority;
  priorityRationale: string;
  score: number;
};

function sectionEnabled(section: string, settings: TailoringSettings) {
  switch (section) {
    case "summary":
      return settings.include_summary;
    case "experience":
      return settings.include_experience;
    case "project":
      return settings.include_projects;
    case "skill":
      return settings.include_skills;
    case "education":
      return settings.include_education;
    case "certification":
      return settings.include_certifications;
    default:
      return true;
  }
}

export const generateTailoredResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string; settings?: unknown }) =>
    z.object({ jobId: z.string().uuid(), settings: z.unknown().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const override = data.settings ? normaliseSettings(data.settings) : undefined;
    const loaded = await loadJobComposition(supabase, data.jobId, override);
    if (!loaded.ok) return fail(loaded.error);
    const composition = loaded.composition;
    const { job, requirements, masterResumeId, settings, candidates, evidence, matchStatusByEvidence } = composition;
    const budget = compositionBudget(settings);

    const saved = await persistPriorities(supabase, userId, data.jobId, composition);
    if (!saved.ok) return fail(saved.error);

    const evidenceById = new Map(evidence.map((row) => [row.id, row]));
    const included = candidates
      .filter((candidate) => candidate.priority !== "exclude" && sectionEnabled(candidate.section, settings))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.score - a.score);

    if (included.length === 0) {
      return fail(
        "Every section is disabled or excluded by the current tailoring settings. Re-enable a section and retry.",
      );
    }

    const narrativeCandidates = included.filter(
      (candidate) => candidate.section === "experience" || candidate.section === "project",
    );
    const summaryCandidate = included.find((candidate) => candidate.section === "summary") ?? null;

    const bulletsFor = (candidate: CandidateResult) => {
      const rows = candidate.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((row): row is CompositionEvidence => !!row);
      const bullets = rows.filter((row) => row.evidence_kind === "bullet");
      const list = bullets.length > 0 ? bullets : rows;
      const limit = candidate.section === "project" ? budget.projectBullets : budget.experienceBullets;
      // In experience, ensure we keep at least 2 bullets (if available) so roles don't become sparse
      const minCap = candidate.section === "experience" ? Math.min(2, list.length) : 1;
      const cap = candidate.priority === "high" ? limit : Math.max(minCap, limit - 1);
      return list.slice(0, cap);
    };

    const catalogue = narrativeCandidates
      .map((candidate) => {
        const rows = bulletsFor(candidate);
        const lines = rows
          .map((row) => {
            const match = matchStatusByEvidence.get(row.id);
            return `    - id=${row.id}${match ? ` | requirement match=${match}` : ""} | ${row.content}`;
          })
          .join("\n");
        const dates = [row0(candidate, evidenceById)?.start_date, row0(candidate, evidenceById)?.end_date]
          .filter(Boolean)
          .join(" – ");
        return `  group: ${candidate.label}${dates ? ` (${dates})` : ""} | section=${candidate.section} | priority=${candidate.priority} | tech: ${[...new Set(candidate.skills)].slice(0, 14).join(", ") || "n/a"}\n${lines}`;
      })
      .join("\n");

    const summaryBlock = summaryCandidate
      ? summaryCandidate.evidenceIds
          .map((id) => `  - id=${id} | ${evidenceById.get(id)?.content ?? ""}`)
          .join("\n")
      : "  (no summary evidence stored)";

    const requirementBlock = requirements.map((row) => `- [${row.requirement_type}] ${row.requirement}`).join("\n");

    const apiKey = process.env["LOVABLE_API_KEY"];
    let generated: z.infer<typeof generatedSchema> | null = null;

    if (apiKey && narrativeCandidates.length > 0) {
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
                content: [
                  `Target role: ${job.title}${job.company ? ` at ${job.company}` : ""}${job.seniority ? ` (${job.seniority})` : ""}`,
                  `Composition settings: length=${resumeLengthLabel[settings.resume_length]}, level=${tailoringLevelLabel[settings.tailoring_level]}, skills=${skillsScopeLabel[settings.skills_scope]}. Summary target: ${budget.summarySentences}. Up to ${budget.experienceBullets} bullets per experience group and ${budget.projectBullets} per project.`,
                  `\nStructured job requirements:\n${requirementBlock}`,
                  `\nSummary evidence:\n${summaryBlock}`,
                  `\nApproved evidence catalogue (the ONLY permitted source of facts — keep every group):\n${catalogue}`,
                ].join("\n"),
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
        if (response.ok) {
          const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
          generated = generatedSchema.parse(JSON.parse(stripFence(payload.choices?.[0]?.message?.content ?? "")));
        }
      } catch {
        generated = null;
      }
    }

    const drafts: Draft[] = [];
    const clean = (ids: string[]) => [...new Set(ids.filter((id) => evidenceById.has(id)))].slice(0, 4);

    // ---------- Summary ----------
    if (summaryCandidate) {
      const aiIds = clean(generated?.summary.evidence_ids ?? []);
      const statement = (generated?.summary.statement ?? "").trim();
      if (statement && aiIds.length > 0) {
        drafts.push({
          section: "summary",
          heading: null,
          statement,
          rationale: generated!.summary.rationale.trim() || "Composed from the cited summary evidence.",
          confidence: generated!.summary.confidence,
          evidenceIds: aiIds,
          priority: summaryCandidate.priority,
          priorityRationale: summaryCandidate.rationale,
          score: summaryCandidate.score,
        });
      } else {
        // Deterministic fallback: the candidate's own stored summary, unchanged.
        const first = summaryCandidate.evidenceIds[0];
        const content = first ? evidenceById.get(first)?.content?.trim() : "";
        if (content) {
          drafts.push({
            section: "summary",
            heading: null,
            statement: content,
            rationale: "Retained verbatim from your master resume summary evidence.",
            confidence: 0.7,
            evidenceIds: clean(summaryCandidate.evidenceIds),
            priority: summaryCandidate.priority,
            priorityRationale: summaryCandidate.rationale,
            score: summaryCandidate.score,
          });
        }
      }
    }

    // ---------- Experience & projects ----------
    const aiBySection = new Map<string, { heading: string; statement: string; ids: string[]; rationale: string; confidence: number }[]>();
    for (const [section, items] of [
      ["experience", generated?.experience ?? []],
      ["project", generated?.projects ?? []],
    ] as const) {
      const list: { heading: string; statement: string; ids: string[]; rationale: string; confidence: number }[] = [];
      for (const item of items) {
        const ids = clean(item.evidence_ids);
        if (!item.statement.trim() || ids.length === 0) continue;
        list.push({
          heading: item.heading.trim(),
          statement: item.statement.trim(),
          ids,
          rationale: item.rationale.trim(),
          confidence: item.confidence,
        });
      }
      aiBySection.set(section, list);
    }

    for (const candidate of narrativeCandidates) {
      const rows = bulletsFor(candidate);
      const allowedIds = new Set(rows.map((row) => row.id));
      const limit = candidate.section === "project" ? budget.projectBullets : budget.experienceBullets;
      const aiItems = (aiBySection.get(candidate.section) ?? []).filter(
        (item) =>
          item.ids.some((id) => allowedIds.has(id)) ||
          item.heading.toLowerCase() === candidate.label.toLowerCase(),
      );

      const usedContent = new Set<string>();
      let count = 0;
      for (const item of aiItems) {
        if (count >= limit) break;
        const ids = item.ids.filter((id) => allowedIds.has(id));
        if (ids.length === 0) continue;
        usedContent.add(ids[0]!);
        drafts.push({
          section: candidate.section,
          heading: candidate.label,
          statement: item.statement,
          rationale: item.rationale || "Derived from the cited evidence.",
          confidence: item.confidence,
          evidenceIds: ids,
          priority: candidate.priority,
          priorityRationale: candidate.rationale,
          score: candidate.score,
        });
        count += 1;
      }

      // Completeness guard: a ranked-in group must never disappear because the model skipped it.
      for (const row of rows) {
        if (count >= limit) break;
        if (usedContent.has(row.id)) continue;
        const statement = row.content.trim();
        if (!statement) continue;
        drafts.push({
          section: candidate.section,
          heading: candidate.label,
          statement,
          rationale: "Retained verbatim from your master resume evidence to keep this entry complete.",
          confidence: 0.75,
          evidenceIds: [row.id],
          priority: candidate.priority,
          priorityRationale: candidate.rationale,
          score: candidate.score,
        });
        usedContent.add(row.id);
        count += 1;
      }
    }

    // ---------- Education & certifications (deterministic, never rewritten) ----------
    for (const candidate of included.filter(
      (row) => row.section === "education" || row.section === "certification",
    )) {
      const rows = candidate.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((row): row is CompositionEvidence => !!row);
      const itemRow = rows.find((row) => row.evidence_kind === "item") ?? rows[0];
      if (!itemRow) continue;
      const dates = [itemRow.start_date, itemRow.end_date].filter(Boolean).join(" – ");
      const headingLower = candidate.label.toLowerCase();
      // The heading already carries the qualification and institution — keep only new detail.
      const detail = itemRow.content
        .split(/\s+[—|·]\s+/)
        .map((part) => part.trim())
        .filter((part) => part && !headingLower.includes(part.toLowerCase()))
        .join(" · ");
      drafts.push({
        section: candidate.section,
        heading: candidate.label,
        statement: [detail, dates].filter(Boolean).join(" · ") || itemRow.content.trim(),
        rationale: "Copied from your master resume record without rewriting.",
        confidence: 0.9,
        evidenceIds: [itemRow.id],
        priority: candidate.priority,
        priorityRationale: candidate.rationale,
        score: candidate.score,
      });
    }

    // ---------- Skills (ranked, never narrowed to job keywords alone) ----------
    const skillCandidates = included
      .filter((candidate) => candidate.section === "skill")
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.score - a.score)
      .slice(0, budget.maxSkills);

    for (const candidate of skillCandidates) {
      let ids = clean(candidate.evidenceIds);
      if (ids.length === 0 && candidate.resumeItemId) {
        ids = clean(
          evidence.filter((row) => row.resume_item_id === candidate.resumeItemId).map((row) => row.id),
        );
      }
      if (ids.length === 0) {
        // Fallback to any evidence in the skill category or evidence referencing the skill
        const fallbackEv = evidence.find(
          (row) => (row.skills ?? []).includes(candidate.label) || row.category === "skill",
        );
        if (fallbackEv) ids = [fallbackEv.id];
      }
      if (ids.length === 0) continue;
      drafts.push({
        section: "skill",
        heading: null,
        statement: candidate.label,
        rationale: candidate.rationale,
        confidence: candidate.priority === "high" ? 0.9 : 0.75,
        evidenceIds: ids,
        priority: candidate.priority,
        priorityRationale: candidate.rationale,
        score: candidate.score,
      });
    }

    if (drafts.length === 0) {
      return fail("The generated draft could not be grounded in your evidence. Please retry the generation.");
    }

    // Stable presentation order: section order, then priority, then relevance score.
    drafts.sort((a, b) => {
      const sectionDelta =
        TAILORED_SECTION_ORDER.indexOf(a.section as never) - TAILORED_SECTION_ORDER.indexOf(b.section as never);
      if (sectionDelta !== 0) return sectionDelta;
      const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      if (b.score !== a.score) return b.score - a.score;
      return (a.heading ?? "").localeCompare(b.heading ?? "");
    });

    const { data: previous } = await supabase
      .from("tailored_resumes")
      .select("version")
      .eq("job_id", data.jobId)
      .order("version", { ascending: false })
      .limit(1);
    const version = (previous?.[0]?.version ?? 0) + 1;

    const { exact: exactCount, related: relatedCount, listedOnly: listedOnlyCount } = composition.requirementsMatched;
    const coverage = requirements.length > 0 ? (exactCount + (relatedCount + listedOnlyCount) * 0.5) / requirements.length : 0;
    const excludedCount = candidates.filter((candidate) => candidate.priority === "exclude").length;

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
        settings,
        match_score: Number(coverage.toFixed(2)),
        evidence_coverage: Number((requirements.length ? exactCount / requirements.length : 0).toFixed(2)),
        notes: `Relevance-ranked composition: ${drafts.length} items selected from ${candidates.length} ranked master-resume candidates (${excludedCount} left out of this version only). Pending evidence validation.`,
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
          priority: draft.priority,
          priority_rationale: draft.priorityRationale,
          source_text: evidenceById.get(draft.evidenceIds[0]!)?.content.slice(0, 800) ?? null,
        })),
      )
      .select("id, sort_order");
    if (itemsError || !insertedItems) return fail(itemsError?.message ?? "Could not save the generated items.");

    const idBySort = new Map(insertedItems.map((row: { sort_order: number; id: string }) => [row.sort_order, row.id]));
    const sources = drafts.flatMap((draft, index) =>
      draft.evidenceIds.map((evidenceId) => {
        const match = matchStatusByEvidence.get(evidenceId);
        const supportType = match === "exact" ? "primary" : match === "listed_only" ? "listed" : "related";
        return {
          user_id: userId,
          tailored_resume_item_id: idBySort.get(index)!,
          resume_evidence_id: evidenceId,
          support_type: supportType,
          confidence: Number(draft.confidence.toFixed(2)),
          excerpt: evidenceById.get(evidenceId)?.content.slice(0, 500) ?? null,
        };
      }),
    );
    const { error: sourcesError } = await supabase.from("tailored_resume_item_sources").insert(sources);
    if (sourcesError) return fail(sourcesError.message);

    return {
      ok: true as const,
      tailoredResumeId: resume.id,
      version,
      itemCount: drafts.length,
      sourceCount: sources.length,
      candidateCount: candidates.length,
      excludedCount,
      aiUsed: !!generated,
      settings,
    };
  });

function row0(candidate: CandidateResult, evidenceById: Map<string, CompositionEvidence>) {
  for (const id of candidate.evidenceIds) {
    const row = evidenceById.get(id);
    if (row) return row;
  }
  return null;
}
