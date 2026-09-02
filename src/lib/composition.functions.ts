import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normaliseSkill } from "@/lib/job-analysis";
import {
  buildJobTerms,
  prioritiseCandidates,
  type CandidateInput,
  type CandidateResult,
} from "@/lib/composition";
import { DEFAULT_TAILORING_SETTINGS, normaliseSettings, type TailoringSettings } from "@/lib/tailoring-settings";

export type CompositionItem = {
  id: string;
  section: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  skills: string[] | null;
  sort_order: number;
};

export type CompositionEvidence = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  content: string;
  skills: string[] | null;
  resume_item_id: string | null;
  evidence_kind: string;
  sort_order: number;
};

export function itemLabel(item: CompositionItem) {
  if (item.section === "experience") return [item.role, item.organization].filter(Boolean).join(" — ") || "Experience";
  if (item.section === "education") return [item.title, item.organization].filter(Boolean).join(" — ") || "Education";
  return item.title || item.role || item.organization || item.section;
}

type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type JobComposition = {
  job: { id: string; title: string; company: string | null; seniority: string | null };
  requirements: {
    id: string;
    requirement: string;
    requirement_type: string | null;
    canonical_skill: string | null;
    keywords: string[] | null;
    sort_order: number;
  }[];
  masterResumeId: string;
  settings: TailoringSettings;
  candidates: CandidateResult[];
  items: CompositionItem[];
  evidence: CompositionEvidence[];
  matchStatusByEvidence: Map<string, "exact" | "related" | "listed_only">;
  requirementsMatched: { exact: number; related: number; listedOnly: number };
};

/**
 * Reads the job, its requirements, the whole master resume and the match report,
 * then ranks every candidate section/item for this job. Read-only against all
 * master-resume tables.
 */
export async function loadJobComposition(
  supabase: SupabaseLike,
  jobId: string,
  settingsOverride?: TailoringSettings,
): Promise<{ ok: false; error: string } | { ok: true; composition: JobComposition }> {
  const fail = (error: string) => ({ ok: false as const, error });

  const [jobRes, reqRes, matchRes, settingsRes, resumeRes] = await Promise.all([
    supabase.from("jobs").select("id, title, company, seniority").eq("id", jobId).maybeSingle(),
    supabase
      .from("job_requirements")
      .select("id, requirement, requirement_type, canonical_skill, keywords, sort_order")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("match_results")
      .select("job_requirement_id, resume_evidence_id, status, master_resume_id")
      .eq("job_id", jobId),
    supabase.from("job_tailoring_settings").select("*").eq("job_id", jobId).maybeSingle(),
    supabase
      .from("master_resumes")
      .select("id")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  if (jobRes.error) return fail(jobRes.error.message);
  if (reqRes.error) return fail(reqRes.error.message);
  if (matchRes.error) return fail(matchRes.error.message);
  if (resumeRes.error) return fail(resumeRes.error.message);
  if (!jobRes.data) return fail("That job could not be found.");
  const requirements = (reqRes.data ?? []) as JobComposition["requirements"];
  if (requirements.length === 0) {
    return fail("This job has no structured requirements yet. Analyze the posting first.");
  }

  const matches = (matchRes.data ?? []) as {
    job_requirement_id: string | null;
    resume_evidence_id: string | null;
    status: string | null;
    master_resume_id: string | null;
  }[];

  const masterResumeId =
    matches.find((row) => row.master_resume_id)?.master_resume_id ?? (resumeRes.data ?? [])[0]?.id ?? null;
  if (!masterResumeId) return fail("You don't have a master resume yet.");

  const settings =
    settingsOverride ??
    (settingsRes?.error ? DEFAULT_TAILORING_SETTINGS : normaliseSettings(settingsRes?.data ?? null));

  const [itemsRes, evidenceRes] = await Promise.all([
    supabase
      .from("resume_items")
      .select("id, section, title, organization, role, start_date, end_date, description, skills, sort_order")
      .eq("master_resume_id", masterResumeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("resume_evidence")
      .select(
        "id, category, title, organization, role, start_date, end_date, content, skills, resume_item_id, evidence_kind, sort_order",
      )
      .eq("master_resume_id", masterResumeId)
      .order("sort_order", { ascending: true }),
  ]);
  if (itemsRes.error) return fail(itemsRes.error.message);
  if (evidenceRes.error) return fail(evidenceRes.error.message);

  const items = (itemsRes.data ?? []) as CompositionItem[];
  const evidence = (evidenceRes.data ?? []) as CompositionEvidence[];
  if (evidence.length === 0) {
    return fail("Your master resume has no evidence records yet. Add experience, projects or skills first.");
  }

  const matchStatusByEvidence = new Map<string, "exact" | "related" | "listed_only">();
  for (const row of matches) {
    if (!row.resume_evidence_id) continue;
    if (row.status === "exact") matchStatusByEvidence.set(row.resume_evidence_id, "exact");
    else if (row.status === "related" && !matchStatusByEvidence.has(row.resume_evidence_id)) {
      matchStatusByEvidence.set(row.resume_evidence_id, "related");
    } else if (row.status === "listed_only" && !matchStatusByEvidence.has(row.resume_evidence_id)) {
      matchStatusByEvidence.set(row.resume_evidence_id, "listed_only");
    }
  }

  const evidenceByItem = new Map<string, CompositionEvidence[]>();
  const summaryEvidence: CompositionEvidence[] = [];
  for (const row of evidence) {
    if (row.category === "summary") {
      summaryEvidence.push(row);
      continue;
    }
    if (!row.resume_item_id) continue;
    const list = evidenceByItem.get(row.resume_item_id) ?? [];
    list.push(row);
    evidenceByItem.set(row.resume_item_id, list);
  }

  const countMatches = (ids: string[]) => {
    let exact = 0;
    let related = 0;
    for (const id of ids) {
      const status = matchStatusByEvidence.get(id);
      if (status === "exact") exact += 1;
      else if (status === "related") related += 1;
    }
    return { exact, related };
  };

  const candidates: CandidateInput[] = [];

  if (summaryEvidence.length > 0) {
    const ids = summaryEvidence.map((row) => row.id);
    const counts = countMatches(ids);
    candidates.push({
      key: "summary",
      section: "summary",
      label: "Professional summary",
      text: summaryEvidence.map((row) => row.content).join(" "),
      skills: [],
      resumeItemId: null,
      resumeEvidenceId: summaryEvidence[0]!.id,
      evidenceIds: ids,
      exactMatches: counts.exact,
      relatedMatches: counts.related,
    });
  }

  for (const item of items) {
    if (item.section === "skill" || item.section === "link") continue;
    const rows = evidenceByItem.get(item.id) ?? [];
    if (rows.length === 0) continue;
    const ids = rows.map((row) => row.id);
    const counts = countMatches(ids);
    candidates.push({
      key: item.id,
      section: item.section,
      label: itemLabel(item),
      text: [item.description ?? "", ...rows.map((row) => row.content)].filter(Boolean).join(" "),
      skills: [...(item.skills ?? []), ...rows.flatMap((row) => row.skills ?? [])],
      resumeItemId: item.id,
      resumeEvidenceId: null,
      evidenceIds: ids,
      exactMatches: counts.exact,
      relatedMatches: counts.related,
    });
  }

  // Skills: every skill label anywhere in the master resume gets ranked; none are dropped from the source.
  type SkillEntry = {
    label: string;
    itemIds: Set<string>;
    evidenceIds: Set<string>;
    text: string[];
  };
  const skillEntries = new Map<string, SkillEntry>();
  const skillEntryFor = (label: string) => {
    const canonical = normaliseSkill(label).canonical;
    const key = canonical.toLowerCase();
    const existing = skillEntries.get(key);
    if (existing) return existing;
    const created: SkillEntry = { label: canonical, itemIds: new Set(), evidenceIds: new Set(), text: [] };
    skillEntries.set(key, created);
    return created;
  };

  for (const item of items) {
    for (const skill of item.skills ?? []) {
      if (!skill.trim()) continue;
      const entry = skillEntryFor(skill);
      entry.itemIds.add(item.id);
      // Link the item's evidence record if one exists
      const itemEvidence = evidence.find((e) => e.resume_item_id === item.id);
      if (itemEvidence) entry.evidenceIds.add(itemEvidence.id);
    }
    // A skill-section item's title is a category header ("Languages", "Tools"), not a skill.
  }
  for (const row of evidence) {
    for (const skill of row.skills ?? []) {
      if (!skill.trim()) continue;
      const entry = skillEntryFor(skill);
      entry.evidenceIds.add(row.id);
      if (row.category !== "skill") entry.text.push(row.content);
    }
  }

  for (const entry of skillEntries.values()) {
    const ids = [...entry.evidenceIds];
    const counts = countMatches(ids);
    candidates.push({
      key: `skill:${entry.label.toLowerCase()}`,
      section: "skill",
      label: entry.label,
      text: entry.text.join(" ").slice(0, 2000),
      skills: [entry.label],
      resumeItemId: [...entry.itemIds][0] ?? null,
      resumeEvidenceId: ids[0] ?? null,
      evidenceIds: ids,
      exactMatches: counts.exact,
      relatedMatches: counts.related,
    });
  }

  const terms = buildJobTerms(requirements, [jobRes.data.title, jobRes.data.seniority ?? ""].filter(Boolean));
  const ranked = prioritiseCandidates(candidates, terms, settings);

  const requirementsMatched = {
    exact: requirements.filter((requirement) =>
      matches.some((row) => row.job_requirement_id === requirement.id && row.status === "exact"),
    ).length,
    related: requirements.filter((requirement) =>
      matches.some((row) => row.job_requirement_id === requirement.id && row.status === "related"),
    ).length,
    listedOnly: requirements.filter((requirement) =>
      matches.some((row) => row.job_requirement_id === requirement.id && row.status === "listed_only"),
    ).length,
  };

  return {
    ok: true,
    composition: {
      job: jobRes.data as JobComposition["job"],
      requirements,
      masterResumeId,
      settings,
      candidates: ranked,
      items,
      evidence,
      matchStatusByEvidence,
      requirementsMatched,
    },
  };
}

/** Persists the per-job priority view. Writes ONLY to job_content_priorities. */
export async function persistPriorities(
  supabase: SupabaseLike,
  userId: string,
  jobId: string,
  composition: JobComposition,
) {
  const rows = composition.candidates.map((candidate) => ({
    user_id: userId,
    job_id: jobId,
    master_resume_id: composition.masterResumeId,
    resume_item_id: candidate.resumeItemId,
    resume_evidence_id: candidate.resumeEvidenceId,
    section: candidate.section,
    label: candidate.label,
    priority: candidate.priority,
    score: candidate.score,
    rationale: candidate.rationale,
    matched_terms: candidate.matchedTerms.slice(0, 20),
  }));

  const { error: deleteError } = await supabase
    .from("job_content_priorities")
    .delete()
    .eq("job_id", jobId)
    .eq("user_id", userId);
  if (deleteError) return { ok: false as const, error: deleteError.message };

  if (rows.length > 0) {
    const { error } = await supabase.from("job_content_priorities").insert(rows);
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const, count: rows.length };
}

export const prioritiseJobContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const loaded = await loadJobComposition(supabase, data.jobId);
    if (!loaded.ok) return { ok: false as const, error: loaded.error };

    const saved = await persistPriorities(supabase, userId, data.jobId, loaded.composition);
    if (!saved.ok) return { ok: false as const, error: saved.error };

    const counts = loaded.composition.candidates.reduce<Record<string, number>>((acc, candidate) => {
      acc[candidate.priority] = (acc[candidate.priority] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true as const,
      total: saved.count,
      high: counts["high"] ?? 0,
      supporting: counts["supporting"] ?? 0,
      low: counts["low"] ?? 0,
      excluded: counts["exclude"] ?? 0,
    };
  });

export const saveTailoringSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string; settings: TailoringSettings }) =>
    z
      .object({
        jobId: z.string().uuid(),
        settings: z.object({
          resume_length: z.enum(["one_page", "two_page"]),
          tailoring_level: z.enum(["conservative", "balanced", "aggressive"]),
          project_inclusion: z.enum(["most_relevant", "relevant_supporting", "all"]),
          skills_scope: z.enum(["job_only", "relevant_supporting", "full_master"]),
          include_summary: z.boolean(),
          include_experience: z.boolean(),
          include_projects: z.boolean(),
          include_skills: z.boolean(),
          include_education: z.boolean(),
          include_certifications: z.boolean(),
        }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("job_tailoring_settings")
      .upsert({ user_id: userId, job_id: data.jobId, ...data.settings }, { onConflict: "user_id,job_id" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, settings: data.settings };
  });
