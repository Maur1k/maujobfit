import { supabase } from "@/integrations/supabase/client";
import { generateTailoredResume } from "@/lib/tailoring.functions";
import {
  proposeTailoredItemRewrite,
  saveTailoredItem,
  validateTailoredResume,
} from "@/lib/validation.functions";
import { classifyMasterSkills } from "@/lib/skill-relevance.functions";
import { snapshotTailoredResume } from "@/lib/versions.functions";
import { normaliseSettings } from "@/lib/tailoring-settings";
import {
  TAILORED_ITEM_COLUMNS,
  TAILORED_RESUME_COLUMNS,
  tailoredSectionLabel,
  type TailoredItemRow,
  type TailoredResumeRow,
  type TailoredSourceRow,
} from "@/lib/tailoring";
import {
  buildProfessionalResumePdf,
  type ProEvidence,
  type ProItem,
} from "@/lib/resume-pdf-professional";


/**
 * One-click path: generate a tailored resume, run the claim check and render the
 * recruiter-facing document — reusing the exact same generation, validation and
 * rendering code as the step-by-step screens, so output is identical.
 *
 * Only claims whose validation status is "supported" are rendered, matching the
 * validated-export behaviour of the detailed screen. The master resume is never
 * modified.
 */

export type QuickResumeFormat = "pdf" | "docx";

export type QuickResumeStep =
  | "idle"
  | "generating"
  | "validating"
  | "repairing"
  | "rendering"
  | "done";

export type QuickResumeResult = {
  blob: Blob;
  fileName: string;
  version: number;
  checked: number;
  includedCount: number;
  excludedCount: number;
  repairedCount: number;
  /** Sections that ended up with nothing printable after the claim check. */
  droppedSections: string[];
};

/** Max flagged lines we try to repair in one press, to keep the wait reasonable. */
const REPAIR_LIMIT = 12;


type Options = {
  jobId: string;
  userId: string;
  format: QuickResumeFormat;
  onStep?: (step: QuickResumeStep) => void;
};

export async function buildResumeInOneStep({
  jobId,
  userId,
  format,
  onStep,
}: Options): Promise<QuickResumeResult> {
  onStep?.("generating");
  const generated = await generateTailoredResume({ data: { jobId } });
  if (!generated.ok) throw new Error(generated.error);
  const tailoredResumeId = generated.tailoredResumeId;
  if (!tailoredResumeId) throw new Error("The resume draft could not be created. Please retry.");

  await snapshotTailoredResume({
    data: {
      tailoredResumeId,
      reason: "generated",
      label: `v${generated.version} · generated`,
      notes: `${generated.itemCount} items with ${generated.sourceCount} citations.`,
    },
  }).catch(() => null);
  await classifyMasterSkills({ data: { jobId } }).catch(() => null);

  onStep?.("validating");
  const validated = await validateTailoredResume({ data: { tailoredResumeId } });
  if (!validated.ok) throw new Error(validated.error);

  // Repair pass: rather than silently dropping every flagged line, ask the existing
  // rewrite step to restate it using only the wording of its own cited records, then
  // save it (which re-checks that single line). Nothing is invented, and lines that
  // cannot be defended from the evidence are left untouched.
  const repairedCount = await repairFlaggedItems(tailoredResumeId, onStep);

  onStep?.("rendering");

  const [jobResult, profileResult, resumeResult, itemsResult, validationsResult] = await Promise.all([
    supabase.from("jobs").select("id, title, company").eq("id", jobId).maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name, headline, email, phone, location, portfolio_url, github_url, linkedin_url")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("tailored_resumes").select(TAILORED_RESUME_COLUMNS).eq("id", tailoredResumeId).maybeSingle(),
    supabase
      .from("tailored_resume_items")
      .select(TAILORED_ITEM_COLUMNS)
      .eq("tailored_resume_id", tailoredResumeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("validation_results")
      .select("tailored_resume_item_id, status")
      .eq("tailored_resume_id", tailoredResumeId),
  ]);

  for (const result of [jobResult, profileResult, resumeResult, itemsResult, validationsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const job = jobResult.data;
  const resume = resumeResult.data as TailoredResumeRow | null;
  if (!job || !resume) throw new Error("The generated resume could not be loaded. Please retry.");

  const items = (itemsResult.data ?? []) as TailoredItemRow[];
  // Scope citations to this draft's items: fetching every citation the account owns
  // can exceed the API row cap once several versions exist, silently dropping sources.
  const itemIds = items.map((item) => item.id);
  const sourcesResult = itemIds.length
    ? await supabase
        .from("tailored_resume_item_sources")
        .select("id, tailored_resume_item_id, resume_evidence_id, support_type, confidence, excerpt")
        .in("tailored_resume_item_id", itemIds)
    : { data: [], error: null };
  if (sourcesResult.error) throw new Error(sourcesResult.error.message);
  const sources = (sourcesResult.data ?? []) as TailoredSourceRow[];

  const statusByItem = new Map<string, string>();
  for (const row of (validationsResult.data ?? []) as {
    tailored_resume_item_id: string | null;
    status: string;
  }[]) {
    if (row.tailored_resume_item_id) statusByItem.set(row.tailored_resume_item_id, row.status);
  }

  const sourcesByItem = new Map<string, TailoredSourceRow[]>();
  for (const row of sources) {
    const list = sourcesByItem.get(row.tailored_resume_item_id) ?? [];
    list.push(row);
    sourcesByItem.set(row.tailored_resume_item_id, list);
  }

  const supportedItems = items.filter(
    (item) => (statusByItem.get(item.id) ?? item.validation_status) === "supported",
  );
  if (supportedItems.length === 0) {
    throw new Error(
      "None of the lines passed the claim check, so there is nothing safe to download yet. Open the detailed review to fix them.",
    );
  }

  const evidenceIds = [...new Set(sources.map((row) => row.resume_evidence_id))];
  const evidenceResult = evidenceIds.length
    ? await supabase
        .from("resume_evidence")
        .select("id, category, title, organization, role, start_date, end_date, content, skills")
        .in("id", evidenceIds)
    : { data: [], error: null };
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);
  const evidence = new Map<string, ProEvidence>(
    ((evidenceResult.data ?? []) as ProEvidence[]).map((row) => [row.id, row]),
  );

  const renderItems: ProItem[] = supportedItems.map((item) => ({
    id: item.id,
    section: item.section,
    heading: item.heading,
    statement: item.statement,
    evidenceIds: (sourcesByItem.get(item.id) ?? [])
      .slice()
      .sort((a, b) => (a.support_type === "primary" ? -1 : b.support_type === "primary" ? 1 : 0))
      .map((source) => source.resume_evidence_id),
  }));

  const settings = normaliseSettings(resume.settings);
  const renderInput = {
    profile: profileResult.data ?? null,
    jobTitle: job.title ?? null,
    version: resume.version,
    paperSize: settings.paper_size,
    onePage: settings.resume_length === "one_page",
    evidence,
    items: renderItems,
  };

  let blob: Blob;
  let fileName: string;
  if (format === "docx") {
    const { buildProfessionalResumeDocx } = await import("@/lib/resume-docx-professional");
    const built = buildProfessionalResumeDocx(renderInput);
    blob = await built.blob();
    fileName = built.fileName;
  } else {
    const built = buildProfessionalResumePdf(renderInput);
    blob = built.blob;
    fileName = built.fileName;
  }

  const { data: exportRow } = await supabase
    .from("exports")
    .insert({
      user_id: userId,
      tailored_resume_id: resume.id,
      format,
      file_name: fileName,
      status: "downloaded_professional_supported_only",
    })
    .select("id")
    .maybeSingle();

  await snapshotTailoredResume({
    data: {
      tailoredResumeId: resume.id,
      reason: "export",
      label: `v${resume.version} · ${format === "docx" ? "Word" : "PDF"} export`,
      supportedOnly: true,
      exportId: exportRow?.id ?? null,
      exportFormat: format,
      notes: `One-click ${format === "docx" ? "Word" : "PDF"} export with ${renderItems.length} supported items.`,
    },
  }).catch(() => null);

  onStep?.("done");

  return {
    blob,
    fileName,
    version: resume.version,
    checked: validated.checked ?? renderItems.length,
    includedCount: renderItems.length,
    excludedCount: items.length - renderItems.length,
  };
}
