import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SKILL_TAXONOMY, normaliseSkill } from "@/lib/job-analysis";
import type { SkillRelevance } from "@/lib/skill-relevance";

type ItemRow = { id: string; section: string; skills: string[] | null };
type EvidenceRow = {
  id: string;
  category: string;
  content: string;
  skills: string[] | null;
  resume_item_id: string | null;
};

function relatedTo(a: string, b: string) {
  if (a === b) return false;
  const entryA = SKILL_TAXONOMY[a];
  const entryB = SKILL_TAXONOMY[b];
  return !!entryA?.related?.includes(b) || !!entryB?.related?.includes(a);
}

/**
 * Read-only, job-scoped relevance layer.
 *
 * Reads master-resume skills and evidence and writes ONLY to job_skill_relevance.
 * It never updates, deletes, reorders or filters resume_items, resume_item_bullets
 * or resume_evidence — the master resume is the immutable source of record.
 */
export const classifyMasterSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const [{ data: job, error: jobError }, { data: requirements, error: reqError }, { data: resumes, error: resumeError }] =
      await Promise.all([
        supabase.from("jobs").select("id, title").eq("id", data.jobId).maybeSingle(),
        supabase
          .from("job_requirements")
          .select("id, requirement, requirement_type, canonical_skill, keywords")
          .eq("job_id", data.jobId),
        supabase
          .from("master_resumes")
          .select("id")
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);
    if (jobError) return fail(jobError.message);
    if (reqError) return fail(reqError.message);
    if (resumeError) return fail(resumeError.message);
    if (!job) return fail("That job could not be found.");
    const masterResumeId = resumes?.[0]?.id;
    if (!masterResumeId) return fail("You don't have a master resume yet.");

    const [{ data: itemData, error: itemError }, { data: evidenceData, error: evidenceError }] = await Promise.all([
      supabase
        .from("resume_items")
        .select("id, section, skills")
        .eq("master_resume_id", masterResumeId),
      supabase
        .from("resume_evidence")
        .select("id, category, content, skills, resume_item_id")
        .eq("master_resume_id", masterResumeId),
    ]);
    if (itemError) return fail(itemError.message);
    if (evidenceError) return fail(evidenceError.message);

    const items = (itemData ?? []) as ItemRow[];
    const evidence = (evidenceData ?? []) as EvidenceRow[];

    // Every skill label that exists anywhere in the master resume, keyed by canonical form.
    type Entry = {
      label: string;
      canonical: string;
      itemIds: Set<string>;
      evidenceIds: Set<string>;
      demonstratedEvidenceIds: Set<string>;
    };
    const entries = new Map<string, Entry>();
    const entryFor = (label: string) => {
      const canonical = normaliseSkill(label).canonical;
      const key = canonical.toLowerCase();
      const existing = entries.get(key);
      if (existing) return existing;
      const created: Entry = {
        label: canonical,
        canonical,
        itemIds: new Set(),
        evidenceIds: new Set(),
        demonstratedEvidenceIds: new Set(),
      };
      entries.set(key, created);
      return created;
    };

    for (const item of items) {
      for (const skill of item.skills ?? []) {
        if (!skill.trim()) continue;
        entryFor(skill).itemIds.add(item.id);
      }
    }
    for (const row of evidence) {
      for (const skill of row.skills ?? []) {
        if (!skill.trim()) continue;
        const entry = entryFor(skill);
        entry.evidenceIds.add(row.id);
        // A "skill" section record only lists the skill; other categories demonstrate it.
        if (row.category !== "skill") entry.demonstratedEvidenceIds.add(row.id);
      }
    }
    // Text mentions in non-skill evidence also count as demonstrating a listed skill.
    for (const entry of entries.values()) {
      const terms = [entry.canonical, ...(SKILL_TAXONOMY[entry.canonical]?.aliases ?? [])].map((t) =>
        t.toLowerCase(),
      );
      for (const row of evidence) {
        if (row.category === "skill") continue;
        if (entry.demonstratedEvidenceIds.has(row.id)) continue;
        const haystack = row.content.toLowerCase();
        if (
          terms.some((term) =>
            new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(
              haystack,
            ),
          )
        ) {
          entry.demonstratedEvidenceIds.add(row.id);
          entry.evidenceIds.add(row.id);
        }
      }
    }

    if (entries.size === 0) {
      return fail("Your master resume has no skills recorded yet. Add skills before classifying relevance.");
    }

    // What this job asks for, canonicalised.
    const asked = new Map<string, string[]>(); // canonical -> requirement ids
    for (const requirement of requirements ?? []) {
      const labels = [
        requirement.canonical_skill,
        ...(requirement.requirement_type === "required_skill" || requirement.requirement_type === "preferred_skill"
          ? [requirement.requirement]
          : []),
        ...((requirement.keywords ?? []) as string[]),
      ].filter((value): value is string => !!value && !!value.trim());
      for (const label of labels) {
        const canonical = normaliseSkill(label).canonical;
        const list = asked.get(canonical) ?? [];
        if (!list.includes(requirement.id)) list.push(requirement.id);
        asked.set(canonical, list);
      }
    }

    const rows = [...entries.values()].map((entry) => {
      const exactRequirements = asked.get(entry.canonical) ?? [];
      const relatedRequirements = [...asked.entries()]
        .filter(([canonical]) => relatedTo(entry.canonical, canonical))
        .flatMap(([, ids]) => ids);
      const demonstrated = [...entry.demonstratedEvidenceIds];

      let relevance: SkillRelevance;
      let rationale: string;
      let requirementIds: string[];

      if (exactRequirements.length > 0 && demonstrated.length > 0) {
        relevance = "exact";
        requirementIds = exactRequirements;
        rationale = `This posting asks for ${entry.canonical} and ${demonstrated.length} master resume evidence record${demonstrated.length === 1 ? "" : "s"} demonstrate${demonstrated.length === 1 ? "s" : ""} it.`;
      } else if (exactRequirements.length > 0) {
        relevance = "listed_only";
        requirementIds = exactRequirements;
        rationale = `This posting asks for ${entry.canonical}, but your master resume only lists it — no experience, project or education evidence demonstrates it yet.`;
      } else if (relatedRequirements.length > 0 && demonstrated.length > 0) {
        relevance = "related";
        requirementIds = [...new Set(relatedRequirements)];
        rationale = `${entry.canonical} is adjacent to what this posting asks for and is demonstrated by ${demonstrated.length} evidence record${demonstrated.length === 1 ? "" : "s"} — related, not equivalent.`;
      } else if (relatedRequirements.length > 0) {
        relevance = "listed_only";
        requirementIds = [...new Set(relatedRequirements)];
        rationale = `${entry.canonical} is adjacent to this posting's requirements but is only listed in your master resume, with no evidence demonstrating it.`;
      } else {
        relevance = "not_relevant";
        requirementIds = [];
        rationale = `This posting does not ask for ${entry.canonical}. It stays in your master resume unchanged and remains available for other jobs.`;
      }

      return {
        user_id: userId,
        job_id: data.jobId,
        master_resume_id: masterResumeId,
        skill_name: entry.label,
        canonical_skill: entry.canonical,
        relevance,
        rationale,
        matched_requirement_ids: requirementIds,
        resume_evidence_ids: [...entry.evidenceIds].slice(0, 20),
        resume_item_ids: [...entry.itemIds].slice(0, 20),
      };
    });

    // Replaces only this job's relevance view; master-resume records are untouched.
    const { error: deleteError } = await supabase
      .from("job_skill_relevance")
      .delete()
      .eq("job_id", data.jobId)
      .eq("user_id", userId);
    if (deleteError) return fail(deleteError.message);

    const { error: insertError } = await supabase.from("job_skill_relevance").insert(rows);
    if (insertError) return fail(insertError.message);

    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.relevance] = (acc[row.relevance] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true as const,
      jobId: data.jobId,
      masterResumeId,
      total: rows.length,
      exact: counts["exact"] ?? 0,
      related: counts["related"] ?? 0,
      listedOnly: counts["listed_only"] ?? 0,
      notRelevant: counts["not_relevant"] ?? 0,
    };
  });
