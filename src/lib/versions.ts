export type SnapshotItem = {
  id: string;
  section: string;
  heading: string | null;
  statement: string;
  validation_status: string;
  evidence_ids: string[];
};

export type ResumeVersionRow = {
  id: string;
  tailored_resume_id: string;
  job_id: string | null;
  version: number;
  snapshot_index: number;
  label: string;
  reason: string;
  supported_only: boolean;
  item_count: number;
  supported_count: number;
  items: SnapshotItem[];
  export_id: string | null;
  export_format: string | null;
  notes: string | null;
  created_at: string;
};

export const snapshotReasonLabel: Record<string, string> = {
  generated: "Generated",
  item_edited: "Item edited",
  rewrite_accepted: "Rewrite accepted",
  export: "Exported",
  cover_letter: "Cover letter",
  manual: "Manual snapshot",
};

export type DiffEntry = {
  key: string;
  section: string;
  heading: string | null;
  change: "added" | "removed" | "changed" | "unchanged";
  before: string | null;
  after: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  evidenceChanged: boolean;
};

function fingerprint(item: SnapshotItem) {
  return `${item.section}::${(item.heading ?? "").trim().toLowerCase()}`;
}

/** Compares two snapshots. Matches by item id first, then by section+heading, then falls through. */
export function diffSnapshots(before: SnapshotItem[], after: SnapshotItem[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const usedAfter = new Set<string>();

  const afterById = new Map(after.map((item) => [item.id, item]));
  const afterByPrint = new Map<string, SnapshotItem[]>();
  for (const item of after) {
    const list = afterByPrint.get(fingerprint(item)) ?? [];
    list.push(item);
    afterByPrint.set(fingerprint(item), list);
  }

  const entryFor = (from: SnapshotItem | null, to: SnapshotItem | null): DiffEntry => {
    const source = to ?? from!;
    const change: DiffEntry["change"] = !from
      ? "added"
      : !to
        ? "removed"
        : from.statement.trim() === to.statement.trim() &&
            (from.heading ?? "") === (to.heading ?? "") &&
            from.validation_status === to.validation_status
          ? "unchanged"
          : "changed";
    return {
      key: source.id,
      section: source.section,
      heading: source.heading,
      change,
      before: from?.statement ?? null,
      after: to?.statement ?? null,
      statusBefore: from?.validation_status ?? null,
      statusAfter: to?.validation_status ?? null,
      evidenceChanged:
        !!from &&
        !!to &&
        [...from.evidence_ids].sort().join(",") !== [...to.evidence_ids].sort().join(","),
    };
  };

  for (const item of before) {
    let match = afterById.get(item.id);
    if (match && usedAfter.has(match.id)) match = undefined;
    if (!match) {
      const candidates = (afterByPrint.get(fingerprint(item)) ?? []).filter((row) => !usedAfter.has(row.id));
      match = candidates[0];
    }
    if (match) usedAfter.add(match.id);
    entries.push(entryFor(item, match ?? null));
  }

  for (const item of after) {
    if (usedAfter.has(item.id)) continue;
    entries.push(entryFor(null, item));
  }

  return entries;
}

export function diffSummary(entries: DiffEntry[]) {
  return {
    added: entries.filter((row) => row.change === "added").length,
    removed: entries.filter((row) => row.change === "removed").length,
    changed: entries.filter((row) => row.change === "changed").length,
    unchanged: entries.filter((row) => row.change === "unchanged").length,
  };
}

/** Word-level inline diff so changed text can be highlighted before/after. */
export function wordDiff(before: string, after: string) {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const setB = new Set(b.map((token) => token.trim().toLowerCase()).filter(Boolean));
  const setA = new Set(a.map((token) => token.trim().toLowerCase()).filter(Boolean));
  return {
    before: a.map((token) => ({ token, removed: !!token.trim() && !setB.has(token.trim().toLowerCase()) })),
    after: b.map((token) => ({ token, added: !!token.trim() && !setA.has(token.trim().toLowerCase()) })),
  };
}
