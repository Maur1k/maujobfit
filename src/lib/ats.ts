import { normaliseSkill, SKILL_TAXONOMY } from "@/lib/job-analysis";

export type KeywordFinding = {
  keyword: string;
  canonical: string;
  status: "exact" | "related" | "missing";
  via: string[];
  importance: string | null;
  requirementType: string | null;
};

export type RequirementFinding = {
  requirement: string;
  requirement_type: string | null;
  importance: string | null;
  status: "exact" | "related" | "missing";
  covered_by: string[];
  detail: string;
};

export type ReadabilityReport = {
  items: number;
  words: number;
  avg_words_per_bullet: number;
  long_bullets: number;
  short_bullets: number;
  weak_verb_bullets: number;
  first_person_bullets: number;
  passive_bullets: number;
  strong_verb_ratio: number;
  notes: string[];
};

export type AtsSuggestion = {
  kind: "add" | "rewrite" | "trim" | "note";
  target: string;
  suggestion: string;
  grounded_in: string[];
  rationale: string;
};

export type AtsAnalysisRow = {
  id: string;
  tailored_resume_id: string;
  job_id: string | null;
  overall_score: number | null;
  keyword_score: number | null;
  requirement_score: number | null;
  readability_score: number | null;
  matched_keywords: string[];
  related_keywords: string[];
  missing_keywords: string[];
  requirement_findings: RequirementFinding[];
  readability: ReadabilityReport & { keywords?: KeywordFinding[] };
  suggestions: AtsSuggestion[];
  analysed_items: number;
  ai_used: boolean;
  created_at: string;
};

const STRONG_VERBS = [
  "built","designed","developed","delivered","led","implemented","migrated","optimised","optimized","automated",
  "integrated","launched","refactored","reduced","improved","shipped","created","architected","maintained","deployed",
  "configured","tested","debugged","scaled","streamlined","documented","collaborated","coordinated","resolved","managed",
];

const WEAK_OPENERS = [
  "responsible for","helped","assisted","worked on","involved in","participated in","tasked with","duties included",
];

export function textMentions(haystack: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * Classifies one job keyword against the resume text using the canonical taxonomy.
 * "exact" = the canonical skill or one of its aliases literally appears.
 * "related" = only a related-but-not-equal skill appears — never counted as exact.
 */
export function classifyKeyword(keyword: string, resumeText: string): { status: KeywordFinding["status"]; canonical: string; via: string[] } {
  const normalised = normaliseSkill(keyword);
  const canonical = normalised.canonical;
  const haystack = resumeText.toLowerCase();

  const exactTerms = [canonical.toLowerCase(), ...normalised.aliases.map((a) => a.toLowerCase())];
  if (exactTerms.some((term) => textMentions(haystack, term))) {
    return { status: "exact", canonical, via: [] };
  }

  const via: string[] = [];
  for (const relatedName of normalised.related) {
    const entry = SKILL_TAXONOMY[relatedName];
    const terms = [relatedName.toLowerCase(), ...(entry?.aliases ?? []).map((a) => a.toLowerCase())];
    if (terms.some((term) => textMentions(haystack, term))) via.push(relatedName);
  }
  // reverse direction: resume names something whose "related" list includes this keyword
  if (via.length === 0) {
    for (const [name, entry] of Object.entries(SKILL_TAXONOMY)) {
      if (!(entry.related ?? []).includes(canonical)) continue;
      const terms = [name.toLowerCase(), ...entry.aliases.map((a) => a.toLowerCase())];
      if (terms.some((term) => textMentions(haystack, term))) via.push(name);
    }
  }

  if (via.length) return { status: "related", canonical, via: [...new Set(via)] };
  return { status: "missing", canonical, via: [] };
}

export function readability(statements: string[]): ReadabilityReport {
  const notes: string[] = [];
  const words = statements.reduce((total, line) => total + line.trim().split(/\s+/).filter(Boolean).length, 0);
  const bullets = statements.filter((line) => line.trim().length > 0);
  const perBullet = bullets.map((line) => line.trim().split(/\s+/).filter(Boolean).length);
  const avg = perBullet.length ? words / perBullet.length : 0;
  const long = perBullet.filter((count) => count > 34).length;
  const short = perBullet.filter((count) => count < 6).length;

  const lower = bullets.map((line) => line.toLowerCase());
  const weak = lower.filter((line) => WEAK_OPENERS.some((opener) => line.startsWith(opener))).length;
  const firstPerson = lower.filter((line) => /\b(i|my|me)\b/.test(line)).length;
  const passive = lower.filter((line) => /\b(was|were|been|being|is|are)\s+\w+(ed|en)\b/.test(line)).length;
  const strong = lower.filter((line) => STRONG_VERBS.some((verb) => line.startsWith(verb))).length;

  if (long) notes.push(`${long} bullet${long === 1 ? "" : "s"} run longer than 34 words — recruiters skim, so tighten them.`);
  if (short) notes.push(`${short} line${short === 1 ? "" : "s"} are very short and may read as fragments.`);
  if (weak) notes.push(`${weak} bullet${weak === 1 ? "" : "s"} open with a passive phrase such as "responsible for".`);
  if (firstPerson) notes.push(`${firstPerson} line${firstPerson === 1 ? "" : "s"} use first-person pronouns; resume convention drops them.`);
  if (passive) notes.push(`${passive} line${passive === 1 ? "" : "s"} read as passive voice.`);
  if (avg > 0 && avg <= 26 && !long && !weak) notes.push("Bullet length and phrasing are in the recruiter-friendly range.");

  return {
    items: bullets.length,
    words,
    avg_words_per_bullet: Number(avg.toFixed(1)),
    long_bullets: long,
    short_bullets: short,
    weak_verb_bullets: weak,
    first_person_bullets: firstPerson,
    passive_bullets: passive,
    strong_verb_ratio: bullets.length ? Number((strong / bullets.length).toFixed(2)) : 0,
    notes,
  };
}

export function readabilityScore(report: ReadabilityReport): number {
  if (report.items === 0) return 0;
  let score = 1;
  score -= (report.long_bullets / report.items) * 0.3;
  score -= (report.short_bullets / report.items) * 0.15;
  score -= (report.weak_verb_bullets / report.items) * 0.25;
  score -= (report.first_person_bullets / report.items) * 0.2;
  score -= (report.passive_bullets / report.items) * 0.15;
  score += Math.min(report.strong_verb_ratio, 0.6) * 0.2;
  if (report.avg_words_per_bullet > 34) score -= 0.1;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

export function weightFor(importance: string | null | undefined) {
  if (importance === "required" || importance === "must_have" || importance === "high") return 1;
  if (importance === "preferred" || importance === "nice_to_have" || importance === "medium") return 0.6;
  return 0.8;
}

export function scoreLabel(score: number) {
  if (score >= 0.85) return "Strong";
  if (score >= 0.7) return "Good";
  if (score >= 0.5) return "Needs work";
  return "Weak";
}
