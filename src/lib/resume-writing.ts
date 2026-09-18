const STRONG_ACTION_OPENERS = [
  "architected",
  "automated",
  "built",
  "configured",
  "created",
  "delivered",
  "deployed",
  "designed",
  "developed",
  "implemented",
  "improved",
  "integrated",
  "launched",
  "maintained",
  "managed",
  "migrated",
  "optimized",
  "optimised",
  "rebuilt",
  "reduced",
  "resolved",
  "shipped",
  "streamlined",
  "supported",
  "tested",
];

const RESULT_PATTERNS = [
  /\bresult(?:ed|ing)? in\b/i,
  /\bled to\b/i,
  /\b(?:increased|reduced|improved|cut|grew|saved|delivered|enabled)\b/i,
  /\b\d+(?:[.,]\d+)?\s*(?:%|x|\+)?\b/i,
  /\b(?:production|deployment|release|launch|delivery|resolution|completion)\b/i,
];

const REFLECTION_PATTERNS = [
  /\b(?:enabling|ensuring|supporting|strengthening|improving|helping|allowing)\b/i,
  /\bso (?:that|teams?|users?|customers?|operations?)\b/i,
  /\bwhich (?:enabled|improved|reduced|supported|strengthened|allowed)\b/i,
  /\bto (?:enable|ensure|support|strengthen|improve)\b/i,
];

export type BulletStructure = {
  action: boolean;
  result: boolean;
  reflection: boolean;
};

/** A conservative writing-quality check; factual support remains a separate validation. */
export function assessBulletStructure(statement: string): BulletStructure {
  const text = statement.trim();
  const firstWord = text.match(/^[A-Za-z]+/)?.[0]?.toLowerCase() ?? "";
  return {
    action: STRONG_ACTION_OPENERS.includes(firstWord),
    result: RESULT_PATTERNS.some((pattern) => pattern.test(text)),
    reflection: REFLECTION_PATTERNS.some((pattern) => pattern.test(text)),
  };
}