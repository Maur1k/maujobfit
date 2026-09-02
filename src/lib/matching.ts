import { SKILL_TAXONOMY, normaliseSkill } from "@/lib/job-analysis";

export const MATCH_STATUSES = ["exact", "related", "listed_only", "missing"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const matchStatusLabel: Record<MatchStatus, string> = {
  exact: "Exact",
  related: "Related",
  listed_only: "Listed Only",
  missing: "Missing",
};

export type EvidenceRow = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  content: string;
  skills: string[];
  evidence_kind: string;
  source_reference: string | null;
};

export type MatchResultRow = {
  id: string;
  job_id: string;
  job_requirement_id: string | null;
  resume_evidence_id: string | null;
  status: string | null;
  coverage: string | null;
  score: number | null;
  rationale: string | null;
  evidence_excerpt: string | null;
  created_at: string;
};

export type MatchVerdict = {
  status: MatchStatus;
  evidenceIds: string[];
  rationale: string;
  confidence: number;
};

const STOP_WORDS = new Set([
  "and","or","the","a","an","to","of","in","for","with","on","at","by","as","is","are","be","that","this","from","using","other","across","multiple","new","our","their","you","will","must","have","has","able","strong","good","experience","years","year","work","working","related","field","plus","etc",
]);

export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .split(/[\s/-]+/)
    .map((token) => token.replace(/^[.+]+|[.+]+$/g, ""))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function evidenceText(evidence: EvidenceRow) {
  return [evidence.title, evidence.role, evidence.organization, evidence.content, evidence.skills.join(" ")]
    .filter(Boolean)
    .join(" ");
}

function mentions(haystack: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/** Canonical skills that an evidence record demonstrates, from its skills list and its text. */
export function evidenceCanonicalSkills(evidence: EvidenceRow): Set<string> {
  const found = new Set<string>();
  for (const skill of evidence.skills) {
    const normalised = normaliseSkill(skill);
    if (normalised.recognised) found.add(normalised.canonical);
  }
  const text = evidenceText(evidence).toLowerCase();
  for (const [canonical, entry] of Object.entries(SKILL_TAXONOMY)) {
    if (found.has(canonical)) continue;
    if (mentions(text, canonical.toLowerCase()) || entry.aliases.some((alias) => mentions(text, alias))) {
      found.add(canonical);
    }
  }
  return found;
}

/**
 * Deterministic skill matching against the canonical taxonomy.
 * Related-but-not-equal relationships never count as exact.
 */
export function matchSkillRequirement(
  requirement: string,
  evidence: EvidenceRow[],
  evidenceSkills: Map<string, Set<string>>,
): MatchVerdict {
  const target = normaliseSkill(requirement);
  const targetRelated = new Set(target.related);
  const exact: EvidenceRow[] = [];
  const related: { row: EvidenceRow; via: string }[] = [];

  for (const row of evidence) {
    const skills = evidenceSkills.get(row.id) ?? new Set<string>();
    if (skills.has(target.canonical)) {
      exact.push(row);
      continue;
    }
    if (!target.recognised && mentions(evidenceText(row), target.canonical)) {
      exact.push(row);
      continue;
    }
    const bridge = [...skills].find((skill) => {
      if (targetRelated.has(skill)) return true;
      const entry = SKILL_TAXONOMY[skill];
      return !!entry?.related?.includes(target.canonical);
    });
    if (bridge) related.push({ row, via: bridge });
  }

  if (exact.length > 0) {
    const demonstrated = exact.filter((row) => row.category !== "skill" || row.evidence_kind === "bullet");
    if (demonstrated.length > 0) {
      const top = demonstrated.slice(0, 3);
      return {
        status: "exact",
        evidenceIds: top.map((row) => row.id),
        rationale: `${target.canonical} is supported directly by ${demonstrated.length} experience/project evidence record${demonstrated.length === 1 ? "" : "s"} (e.g. ${describe(top[0]!)}).`,
        confidence: Math.min(0.95, 0.8 + 0.05 * demonstrated.length),
      };
    }
    // Skill is in the master skills section, but has no supporting bullet/project evidence
    const top = exact.slice(0, 3);
    return {
      status: "listed_only",
      evidenceIds: top.map((row) => row.id),
      rationale: `${target.canonical} is listed in your Master Resume skills, but has no supporting experience or project bullet evidence demonstrating it yet.`,
      confidence: 0.75,
    };
  }
  if (related.length > 0) {
    const top = related.slice(0, 3);
    const vias = [...new Set(top.map((item) => item.via))].join(", ");
    return {
      status: "related",
      evidenceIds: top.map((item) => item.row.id),
      rationale: `No direct evidence names ${target.canonical}. Adjacent evidence covers ${vias}, which is related but not equivalent.`,
      confidence: 0.45,
    };
  }
  return {
    status: "missing",
    evidenceIds: [],
    rationale: `No master resume evidence supports ${target.canonical}.`,
    confidence: 0.9,
  };
}

/** Fallback for prose requirements when AI classification is unavailable. */
export function matchProseRequirement(requirement: string, evidence: EvidenceRow[]): MatchVerdict {
  const tokens = significantTokens(requirement);
  if (tokens.length === 0) {
    return { status: "missing", evidenceIds: [], rationale: "The requirement has no matchable terms.", confidence: 0.3 };
  }
  const scored = evidence
    .map((row) => {
      const text = evidenceText(row).toLowerCase();
      const hits = tokens.filter((token) => text.includes(token)).length;
      return { row, ratio: hits / tokens.length };
    })
    .filter((item) => item.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);

  const best = scored[0];
  if (!best) {
    return {
      status: "missing",
      evidenceIds: [],
      rationale: "No evidence record overlaps with this requirement.",
      confidence: 0.7,
    };
  }
  const top = scored.filter((item) => item.ratio >= best.ratio * 0.75).slice(0, 3);
  if (best.ratio >= 0.6) {
    return {
      status: "exact",
      evidenceIds: top.map((item) => item.row.id),
      rationale: `Evidence covers this directly (${describe(best.row)}).`,
      confidence: Math.min(0.9, best.ratio),
    };
  }
  return {
    status: "related",
    evidenceIds: top.map((item) => item.row.id),
    rationale: `Partial overlap only — related experience in ${describe(best.row)}, but not a direct match.`,
    confidence: Math.max(0.3, best.ratio),
  };
}

export function describe(evidence: EvidenceRow) {
  const label = [evidence.role, evidence.title].filter(Boolean).join(" — ") || evidence.category;
  return evidence.organization ? `${label} at ${evidence.organization}` : label;
}

export function coverageSummary(rows: { status: string | null }[]) {
  const counts = { exact: 0, related: 0, listed_only: 0, missing: 0 };
  for (const row of rows) {
    const status = (row.status ?? "missing") as MatchStatus;
    if (status in counts) counts[status] += 1;
  }
  const total = counts.exact + counts.related + counts.listed_only + counts.missing;
  const score = total === 0 ? 0 : (counts.exact + (counts.related + counts.listed_only) * 0.5) / total;
  return { ...counts, total, score };
}
