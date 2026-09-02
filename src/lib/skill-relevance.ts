export const SKILL_RELEVANCE = ["exact", "related", "listed_only", "not_relevant"] as const;
export type SkillRelevance = (typeof SKILL_RELEVANCE)[number];

export type JobSkillRelevanceRow = {
  id: string;
  job_id: string;
  master_resume_id: string;
  skill_name: string;
  canonical_skill: string;
  relevance: SkillRelevance;
  rationale: string;
  matched_requirement_ids: string[];
  resume_evidence_ids: string[];
  resume_item_ids: string[];
  created_at: string;
};

export const skillRelevanceLabel: Record<SkillRelevance, string> = {
  exact: "Matched skills",
  related: "Supporting skills",
  listed_only: "Listed only",
  not_relevant: "Other master resume skills",
};

export const skillRelevanceBlurb: Record<SkillRelevance, string> = {
  exact: "This job names the skill and your master resume evidence names it too.",
  related:
    "Adjacent evidence supports this skill without being equivalent — it is never presented as an exact match.",
  listed_only:
    "The skill is listed in your master resume but no experience, project or education evidence demonstrates it yet.",
  not_relevant:
    "Not asked for by this posting. It stays in your master resume in full and can be used for any other job.",
};

export const skillRelevanceBadgeClass: Record<SkillRelevance, string> = {
  exact: "bg-[hsl(var(--evidence))] text-[hsl(var(--evidence-foreground))]",
  related: "bg-amber-500 text-white",
  listed_only: "bg-secondary text-secondary-foreground",
  not_relevant: "bg-muted text-muted-foreground",
};

/** Master-resume skills are only ever *presented* per job — nothing is removed from the source. */
export const MASTER_IMMUTABILITY_NOTE =
  "Relevance is a per-job view only. Skills omitted from a tailored resume are never deleted, reordered or hidden in your Master Resume — every record stays intact there.";

export function groupSkillRelevance(rows: JobSkillRelevanceRow[]) {
  const groups: Record<SkillRelevance, JobSkillRelevanceRow[]> = {
    exact: [],
    related: [],
    listed_only: [],
    not_relevant: [],
  };
  for (const row of rows) {
    if (groups[row.relevance]) groups[row.relevance].push(row);
  }
  for (const key of SKILL_RELEVANCE) {
    groups[key].sort((a, b) => a.skill_name.localeCompare(b.skill_name));
  }
  return groups;
}
