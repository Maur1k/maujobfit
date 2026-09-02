import { SKILL_TAXONOMY, normaliseSkill } from "@/lib/job-analysis";
import type { TailoringSettings } from "@/lib/tailoring-settings";
import { compositionBudget } from "@/lib/tailoring-settings";

/**
 * Relevance-ranked composition.
 *
 * Every candidate piece of master-resume content is *ranked*, never deleted.
 * The ranking is a per-job presentation layer: master resume records are the
 * immutable source of record and are only ever read here.
 */

export const COMPOSITION_PRIORITIES = ["high", "supporting", "low", "exclude"] as const;
export type CompositionPriority = (typeof COMPOSITION_PRIORITIES)[number];

export const priorityLabel: Record<CompositionPriority, string> = {
  high: "High priority",
  supporting: "Supporting",
  low: "Low priority",
  exclude: "Not used in this version",
};

export const priorityBlurb: Record<CompositionPriority, string> = {
  high: "Directly answers what this posting asks for, so it is emphasised and placed first.",
  supporting: "Meaningful, transferable evidence that rounds out the resume without being an exact keyword match.",
  low: "Kept in the tailored resume as space allows — still your own evidence, just less central to this posting.",
  exclude:
    "Left out of this version only (irrelevant, redundant, or beyond the chosen page length). The record stays in your Master Resume in full.",
};

export const priorityBadgeClass: Record<CompositionPriority, string> = {
  high: "bg-[hsl(var(--evidence))] text-[hsl(var(--evidence-foreground))]",
  supporting: "bg-amber-500 text-white",
  low: "bg-secondary text-secondary-foreground",
  exclude: "bg-muted text-muted-foreground",
};

export type JobContentPriorityRow = {
  id: string;
  job_id: string;
  master_resume_id: string;
  resume_item_id: string | null;
  resume_evidence_id: string | null;
  section: string;
  label: string;
  priority: CompositionPriority;
  score: number;
  rationale: string;
  matched_terms: string[];
  created_at: string;
};

export type JobTerms = {
  /** lowercase search term -> display label */
  exact: Map<string, string>;
  related: Map<string, string>;
};

function addTerm(map: Map<string, string>, label: string) {
  const value = label.trim();
  if (value.length < 2) return;
  map.set(value.toLowerCase(), value);
}

export type RequirementLite = {
  requirement: string;
  requirement_type: string | null;
  canonical_skill?: string | null;
  keywords?: string[] | null;
};

export function buildJobTerms(requirements: RequirementLite[], extra: string[] = []): JobTerms {
  const exact = new Map<string, string>();

  for (const requirement of requirements) {
    const labels: string[] = [];
    if (requirement.canonical_skill) labels.push(requirement.canonical_skill);
    if (
      requirement.requirement_type === "required_skill" ||
      requirement.requirement_type === "preferred_skill" ||
      requirement.requirement_type === "tool"
    ) {
      labels.push(requirement.requirement);
    }
    for (const keyword of requirement.keywords ?? []) labels.push(keyword);

    for (const label of labels) {
      const { canonical } = normaliseSkill(label);
      addTerm(exact, canonical);
      for (const alias of SKILL_TAXONOMY[canonical]?.aliases ?? []) addTerm(exact, alias);
    }
  }
  for (const label of extra) {
    const { canonical } = normaliseSkill(label);
    addTerm(exact, canonical);
  }

  const related = new Map<string, string>();
  for (const label of new Set(exact.values())) {
    for (const relatedLabel of SKILL_TAXONOMY[label]?.related ?? []) {
      if (exact.has(relatedLabel.toLowerCase())) continue;
      addTerm(related, relatedLabel);
      for (const alias of SKILL_TAXONOMY[relatedLabel]?.aliases ?? []) {
        if (exact.has(alias.toLowerCase())) continue;
        addTerm(related, alias);
      }
    }
  }

  return { exact, related };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hits(haystack: string, terms: Map<string, string>) {
  const found = new Set<string>();
  for (const [term, label] of terms) {
    const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(term)}([^a-z0-9+#]|$)`, "i");
    if (pattern.test(haystack)) found.add(label);
  }
  return [...found];
}

export type CandidateInput = {
  /** stable key: resume_item_id, or a synthetic key for skills / summary */
  key: string;
  section: string;
  label: string;
  text: string;
  skills: string[];
  resumeItemId: string | null;
  resumeEvidenceId: string | null;
  evidenceIds: string[];
  /** how many match_results marked this candidate's evidence an exact / related match */
  exactMatches: number;
  relatedMatches: number;
};

export type CandidateResult = CandidateInput & {
  score: number;
  priority: CompositionPriority;
  rationale: string;
  matchedTerms: string[];
};

const SECTION_BASE: Record<string, number> = {
  summary: 6,
  experience: 3,
  project: 1.5,
  education: 1.5,
  certification: 1,
  skill: 0,
};

const LEVEL_THRESHOLDS: Record<TailoringSettings["tailoring_level"], { high: number; supporting: number }> = {
  conservative: { high: 7, supporting: 1 },
  balanced: { high: 6, supporting: 2.5 },
  aggressive: { high: 5, supporting: 4 },
};

export function scoreCandidate(candidate: CandidateInput, terms: JobTerms) {
  const haystack = `${candidate.label} ${candidate.text} ${candidate.skills.join(" ")}`.toLowerCase();
  const exactHits = hits(haystack, terms.exact);
  const relatedHits = hits(haystack, terms.related);

  const score =
    (SECTION_BASE[candidate.section] ?? 1) +
    Math.min(exactHits.length, 6) * 2.5 +
    Math.min(relatedHits.length, 6) * 1.2 +
    Math.min(candidate.exactMatches, 3) * 2 +
    Math.min(candidate.relatedMatches, 3) * 1;

  return { score: Number(score.toFixed(2)), exactHits, relatedHits };
}

function rationaleFor(
  candidate: CandidateInput,
  priority: CompositionPriority,
  exactHits: string[],
  relatedHits: string[],
) {
  const overlap = exactHits.length > 0 ? `matches this posting on ${exactHits.slice(0, 6).join(", ")}` : "";
  const adjacent =
    relatedHits.length > 0 ? `carries adjacent, transferable evidence (${relatedHits.slice(0, 6).join(", ")})` : "";
  const matchNote =
    candidate.exactMatches > 0
      ? `${candidate.exactMatches} requirement${candidate.exactMatches === 1 ? "" : "s"} are matched exactly by this evidence`
      : candidate.relatedMatches > 0
        ? `${candidate.relatedMatches} requirement${candidate.relatedMatches === 1 ? "" : "s"} are supported indirectly`
        : "";
  const reasons = [overlap, adjacent, matchNote].filter(Boolean);

  switch (priority) {
    case "high":
      return `High priority: ${reasons.join("; ") || "core to the target role and fully evidence-backed"}.`;
    case "supporting":
      return `Supporting: ${reasons.join("; ") || "no direct keyword overlap, but it is real, transferable evidence worth keeping"}.`;
    case "low":
      return `Low priority: ${reasons.join("; ") || "no overlap with this posting"} — retained as space allows.`;
    case "exclude":
      return `Excluded from this version: ${reasons.join("; ") || "no relevance to this posting and redundant with stronger entries"}. It stays in your Master Resume unchanged.`;
  }
}

/**
 * Ranks candidates and applies the user's settings as a *presentation* budget.
 * Exclusion is deliberately rare: only genuinely irrelevant content, or content
 * pushed out by an explicit page-length choice (which is recorded as such).
 */
export function prioritiseCandidates(
  candidates: CandidateInput[],
  terms: JobTerms,
  settings: TailoringSettings,
): CandidateResult[] {
  const thresholds = LEVEL_THRESHOLDS[settings.tailoring_level];
  const budget = compositionBudget(settings);

  const scored = candidates.map((candidate) => {
    const { score, exactHits, relatedHits } = scoreCandidate(candidate, terms);
    const hasSignal = exactHits.length > 0 || relatedHits.length > 0 || candidate.exactMatches > 0;
    let priority: CompositionPriority =
      score >= thresholds.high && hasSignal ? "high" : score >= thresholds.supporting ? "supporting" : "low";
    if (candidate.section === "summary") priority = "high";
    return {
      ...candidate,
      score,
      priority: priority as CompositionPriority,
      matchedTerms: [...exactHits, ...relatedHits],
      rationale: "",
      exactHits,
      relatedHits,
    };
  });

  // Section budgets — the only source of "exclude" besides zero relevance.
  const bySection = new Map<string, typeof scored>();
  for (const row of scored) {
    const list = bySection.get(row.section) ?? [];
    list.push(row);
    bySection.set(row.section, list);
  }

  for (const [section, list] of bySection) {
    list.sort((a, b) => b.score - a.score);

    if (section === "project") {
      if (settings.project_inclusion === "most_relevant") {
        for (const row of list) if (row.priority === "low") row.priority = "exclude";
      }
      list.forEach((row, index) => {
        if (index >= budget.projectGroups && row.priority !== "high") row.priority = "exclude";
      });
    }

    if (section === "skill" && settings.skills_scope === "job_only") {
      for (const row of list) if (row.priority === "low") row.priority = "exclude";
    }

    if (section === "experience") {
      list.forEach((row, index) => {
        if (index >= budget.experienceGroups && row.priority === "low") row.priority = "exclude";
      });
    }

    if (!budget.includeLow && section !== "skill") {
      for (const row of list) if (row.priority === "low") row.priority = "exclude";
    }
  }

  return scored.map((row) => ({
    key: row.key,
    section: row.section,
    label: row.label,
    text: row.text,
    skills: row.skills,
    resumeItemId: row.resumeItemId,
    resumeEvidenceId: row.resumeEvidenceId,
    evidenceIds: row.evidenceIds,
    exactMatches: row.exactMatches,
    relatedMatches: row.relatedMatches,
    score: row.score,
    priority: row.priority,
    matchedTerms: row.matchedTerms,
    rationale: rationaleFor(row, row.priority, row.exactHits, row.relatedHits),
  }));
}

export const PRIORITY_RANK: Record<CompositionPriority, number> = {
  high: 0,
  supporting: 1,
  low: 2,
  exclude: 3,
};

export function groupPriorities(rows: JobContentPriorityRow[]) {
  const groups: Record<CompositionPriority, JobContentPriorityRow[]> = {
    high: [],
    supporting: [],
    low: [],
    exclude: [],
  };
  for (const row of rows) if (groups[row.priority]) groups[row.priority].push(row);
  for (const key of COMPOSITION_PRIORITIES) groups[key].sort((a, b) => b.score - a.score);
  return groups;
}
