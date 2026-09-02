export const VALIDATION_STATUSES = [
  "supported",
  "partially_supported",
  "unsupported",
  "needs_review",
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const validationStatusLabel: Record<string, string> = {
  supported: "Supported",
  partially_supported: "Partially supported",
  unsupported: "Unsupported",
  needs_review: "Needs review",
  pending: "Not validated",
};

export const validationIssueLabel: Record<string, string> = {
  missing_citation: "No citation stored for this claim",
  invalid_citation: "A cited evidence record no longer exists",
  unsupported_metric: "Numbers or metrics are not present in the cited evidence",
  unsupported_span: "Wording is not substantiated by the cited evidence",
  altered_fact: "Employer, project or role differs from the cited evidence",
  timeframe_mismatch: "Timeframe is not supported by the cited evidence",
  overstatement: "Scope or seniority is stronger than the evidence shows",
  weak_overlap: "Little of the wording traces back to the cited evidence",
  ai_unavailable: "Automated language check could not run — deterministic checks only",
};

export type ValidationRow = {
  id: string;
  tailored_resume_id: string;
  tailored_resume_item_id: string | null;
  check_type: string;
  severity: string;
  passed: boolean;
  message: string | null;
  status: string;
  rationale: string | null;
  confidence: number | null;
  evidence_ids: string[];
  evidence_excerpts: string[];
  unsupported_spans: string[];
  issues: string[];
  validator: string;
  run_at: string;
};

const STATUS_RANK: Record<ValidationStatus, number> = {
  supported: 3,
  partially_supported: 2,
  needs_review: 1,
  unsupported: 0,
};

/** Never let a status be reported stronger than the deterministic ceiling allows. */
export function capStatus(status: ValidationStatus, ceiling: ValidationStatus): ValidationStatus {
  return STATUS_RANK[status] <= STATUS_RANK[ceiling] ? status : ceiling;
}

export function severityFor(status: ValidationStatus): string {
  if (status === "supported") return "info";
  if (status === "partially_supported") return "warning";
  if (status === "needs_review") return "warning";
  return "error";
}

export function validationSummary(rows: { status: string }[]) {
  const counts: Record<ValidationStatus, number> = {
    supported: 0,
    partially_supported: 0,
    unsupported: 0,
    needs_review: 0,
  };
  for (const row of rows) {
    if (row.status in counts) counts[row.status as ValidationStatus] += 1;
  }
  const total = rows.length;
  const flagged = counts.unsupported + counts.needs_review + counts.partially_supported;
  return { ...counts, total, flagged };
}

/** Numeric / metric tokens that must be literally traceable to the evidence. */
export function metricTokens(text: string): string[] {
  const matches = text.match(/(?:\d+(?:[.,]\d+)?\s*%?|\b\d+x\b)/gi) ?? [];
  return [...new Set(matches.map((token) => token.replace(/\s+/g, "").toLowerCase()))];
}

export function normaliseForCompare(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();
}

export function containsMetric(haystack: string, metric: string): boolean {
  const bare = metric.replace(/[%x]$/i, "");
  const normalised = normaliseForCompare(haystack);
  return normalised.includes(metric) || normalised.includes(bare);
}

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","into","over","using","used","use","have","has","had",
  "was","were","are","been","being","its","their","our","your","across","within","while","also","them",
  "than","then","when","where","which","what","who","whom","will","would","can","could","should","may",
  "more","most","less","such","other","both","each","per","via","upon","onto","about","after","before",
  "team","teams","work","working","worked","role","project","projects","company","new","end",
]);

export function contentTokens(text: string): string[] {
  return [
    ...new Set(
      normaliseForCompare(text)
        .split(" ")
        .filter((token) => token.length > 3 && !STOPWORDS.has(token)),
    ),
  ];
}

export function overlapRatio(statement: string, evidenceText: string): number {
  const tokens = contentTokens(statement);
  if (tokens.length === 0) return 0;
  const evidence = new Set(contentTokens(evidenceText));
  const hits = tokens.filter((token) => evidence.has(token)).length;
  return hits / tokens.length;
}
