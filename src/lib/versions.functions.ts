import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SnapshotItem } from "@/lib/versions";

const REASONS = ["generated", "item_edited", "rewrite_accepted", "export", "cover_letter", "manual"] as const;

type Ctx = { supabase: any; userId: string };

/**
 * Captures an append-only snapshot of a tailored resume's current items.
 * History is never overwritten or deleted; identical consecutive snapshots are skipped
 * unless the snapshot is tied to an export (those must always be recorded).
 */
export async function captureSnapshot(
  ctx: Ctx,
  args: {
    tailoredResumeId: string;
    reason: (typeof REASONS)[number];
    label?: string;
    supportedOnly?: boolean;
    exportId?: string | null;
    exportFormat?: string | null;
    notes?: string | null;
  },
) {
  const { supabase, userId } = ctx;

  const { data: resume, error: resumeError } = await supabase
    .from("tailored_resumes")
    .select("id, job_id, title, version")
    .eq("id", args.tailoredResumeId)
    .maybeSingle();
  if (resumeError) throw new Error(resumeError.message);
  if (!resume) throw new Error("That tailored resume could not be found.");

  const { data: itemRows, error: itemsError } = await supabase
    .from("tailored_resume_items")
    .select("id, section, heading, statement, validation_status, sort_order")
    .eq("tailored_resume_id", resume.id)
    .order("sort_order", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);
  const items = itemRows ?? [];

  const { data: sourceRows, error: sourcesError } = await supabase
    .from("tailored_resume_item_sources")
    .select("tailored_resume_item_id, resume_evidence_id, support_type")
    .eq("user_id", userId);
  if (sourcesError) throw new Error(sourcesError.message);

  const byItem = new Map<string, string[]>();
  for (const row of sourceRows ?? []) {
    const list = byItem.get(row.tailored_resume_item_id) ?? [];
    if (row.resume_evidence_id) list.push(row.resume_evidence_id);
    byItem.set(row.tailored_resume_item_id, list);
  }

  const snapshot: SnapshotItem[] = items.map((item: any) => ({
    id: item.id,
    section: item.section,
    heading: item.heading,
    statement: item.statement,
    validation_status: item.validation_status,
    evidence_ids: byItem.get(item.id) ?? [],
  }));

  const { data: latestRows, error: latestError } = await supabase
    .from("tailored_resume_versions")
    .select("id, snapshot_index, items")
    .eq("tailored_resume_id", resume.id)
    .order("snapshot_index", { ascending: false })
    .limit(1);
  if (latestError) throw new Error(latestError.message);
  const latest = latestRows?.[0] ?? null;

  if (latest && args.reason !== "export" && JSON.stringify(latest.items) === JSON.stringify(snapshot)) {
    return { snapshotId: latest.id as string, skipped: true, itemCount: snapshot.length };
  }

  const snapshotIndex = (latest?.snapshot_index ?? 0) + 1;
  const supportedCount = snapshot.filter((row) => row.validation_status === "supported").length;

  const { data: inserted, error: insertError } = await supabase
    .from("tailored_resume_versions")
    .insert({
      user_id: userId,
      tailored_resume_id: resume.id,
      job_id: resume.job_id,
      version: resume.version,
      snapshot_index: snapshotIndex,
      label: args.label || `v${resume.version} · snapshot ${snapshotIndex}`,
      reason: args.reason,
      supported_only: args.supportedOnly ?? false,
      item_count: snapshot.length,
      supported_count: supportedCount,
      items: snapshot,
      export_id: args.exportId ?? null,
      export_format: args.exportFormat ?? null,
      notes: args.notes ?? null,
    })
    .select("id")
    .maybeSingle();
  if (insertError) throw new Error(insertError.message);

  return { snapshotId: (inserted?.id as string) ?? null, skipped: false, itemCount: snapshot.length };
}

export const snapshotTailoredResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      tailoredResumeId: string;
      reason?: string;
      label?: string;
      supportedOnly?: boolean;
      exportId?: string | null;
      exportFormat?: string | null;
      notes?: string | null;
    }) =>
      z
        .object({
          tailoredResumeId: z.string().uuid(),
          reason: z.enum(REASONS).default("manual"),
          label: z.string().trim().max(160).optional(),
          supportedOnly: z.boolean().optional(),
          exportId: z.string().uuid().nullable().optional(),
          exportFormat: z.string().trim().max(40).nullable().optional(),
          notes: z.string().trim().max(600).nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      const result = await captureSnapshot(
        { supabase: context.supabase, userId: context.userId },
        {
          tailoredResumeId: data.tailoredResumeId,
          reason: data.reason,
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.supportedOnly !== undefined ? { supportedOnly: data.supportedOnly } : {}),
          exportId: data.exportId ?? null,
          exportFormat: data.exportFormat ?? null,
          notes: data.notes ?? null,
        },
      );
      return { ok: true as const, ...result };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save a version snapshot." };
    }
  });
