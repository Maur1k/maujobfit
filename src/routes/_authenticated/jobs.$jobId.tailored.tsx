import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileCheck2,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateTailoredResume } from "@/lib/tailoring.functions";
import { validateTailoredResume } from "@/lib/validation.functions";
import { classifyMasterSkills } from "@/lib/skill-relevance.functions";
import { SkillRelevancePanel, skillRelevanceQueryKey } from "@/components/jobs/SkillRelevancePanel";
import {
  validationIssueLabel,
  validationStatusLabel,
  validationSummary,
  type ValidationRow,
} from "@/lib/validation";
import {
  tailoredSectionLabel,
  TAILORED_ITEM_COLUMNS,
  TAILORED_RESUME_COLUMNS,
  TAILORED_SECTIONS,
  type TailoredItemRow,
  type TailoredResumeRow,
  type TailoredSourceRow,
} from "@/lib/tailoring";
import {
  TailoringSettingsCard,
  tailoringSettingsQueryKey,
} from "@/components/jobs/TailoringSettingsCard";
import {
  ContentPriorityPanel,
  contentPriorityQueryKey,
} from "@/components/jobs/ContentPriorityPanel";
import { priorityBadgeClass, priorityLabel, type CompositionPriority } from "@/lib/composition";
import { normaliseSettings, settingsSummary } from "@/lib/tailoring-settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  StatusIcon,
  statusBadgeClass,
  TailoredItemCard,
  type EvidenceLite,
} from "@/components/tailored/TailoredItemCard";
import { buildTailoredResumePdf } from "@/lib/resume-pdf";
import { snapshotTailoredResume } from "@/lib/versions.functions";
import { buildProfessionalResumePdf, type ProEvidence } from "@/lib/resume-pdf-professional";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/tailored")({
  head: () => ({
    meta: [
      { title: "Tailored Resume — MauJobFit" },
      {
        name: "description",
        content:
          "Review an evidence-backed tailored resume: every generated line cites the master resume evidence it came from, pending validation.",
      },
      { property: "og:title", content: "Tailored Resume — MauJobFit" },
      {
        property: "og:description",
        content: "A tailored resume generated only from your own approved master resume evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TailoredResumePage,
});

function TailoredResumePage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [supportedOnly, setSupportedOnly] = useState(false);
  const [exporting, setExporting] = useState<"professional" | "audit" | "docx" | null>(null);
  const queryKey = ["tailored-resume", jobId, user?.id];

  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const job = await supabase
        .from("jobs")
        .select("id, title, company")
        .eq("id", jobId)
        .maybeSingle();
      if (job.error) throw new Error(job.error.message);

      const profile = await supabase
        .from("profiles")
        .select(
          "full_name, headline, email, phone, location, portfolio_url, github_url, linkedin_url",
        )
        .eq("id", user!.id)
        .maybeSingle();
      if (profile.error) throw new Error(profile.error.message);

      const resumes = await supabase
        .from("tailored_resumes")
        .select(TAILORED_RESUME_COLUMNS)
        .eq("job_id", jobId)
        .order("version", { ascending: false })
        .limit(1);
      if (resumes.error) throw new Error(resumes.error.message);
      const resume = (resumes.data?.[0] ?? null) as TailoredResumeRow | null;
      if (!resume) {
        return {
          job: job.data,
          profile: profile.data,
          resume: null,
          items: [],
          sources: [],
          evidence: new Map<string, EvidenceLite>(),
          validations: [] as ValidationRow[],
        };
      }

      const [items, sources, validations] = await Promise.all([
        supabase
          .from("tailored_resume_items")
          .select(TAILORED_ITEM_COLUMNS)
          .eq("tailored_resume_id", resume.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tailored_resume_item_sources")
          .select(
            "id, tailored_resume_item_id, resume_evidence_id, support_type, confidence, excerpt",
          )
          .eq("user_id", user!.id),
        supabase
          .from("validation_results")
          .select(
            "id, tailored_resume_id, tailored_resume_item_id, check_type, severity, passed, message, status, rationale, confidence, evidence_ids, evidence_excerpts, unsupported_spans, issues, validator, run_at",
          )
          .eq("tailored_resume_id", resume.id),
      ]);
      if (items.error) throw new Error(items.error.message);
      if (sources.error) throw new Error(sources.error.message);
      if (validations.error) throw new Error(validations.error.message);

      const itemIds = new Set((items.data ?? []).map((row) => row.id));
      const scopedSources = ((sources.data ?? []) as TailoredSourceRow[]).filter((row) =>
        itemIds.has(row.tailored_resume_item_id),
      );
      const evidenceIds = [...new Set(scopedSources.map((row) => row.resume_evidence_id))];
      const evidence = evidenceIds.length
        ? await supabase
            .from("resume_evidence")
            .select(
              "id, category, title, organization, role, start_date, end_date, content, skills",
            )
            .in("id", evidenceIds)
        : { data: [], error: null };
      if (evidence.error) throw new Error(evidence.error.message);

      return {
        job: job.data,
        profile: profile.data,
        resume,
        items: (items.data ?? []) as TailoredItemRow[],
        sources: scopedSources,
        evidence: new Map(((evidence.data ?? []) as EvidenceLite[]).map((row) => [row.id, row])),
        validations: (validations.data ?? []) as ValidationRow[],
      };
    },
    enabled: !!user,
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await generateTailoredResume({ data: { jobId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.tailoredResumeId) {
        await snapshotTailoredResume({
          data: {
            tailoredResumeId: result.tailoredResumeId,
            reason: "generated",
            label: `v${result.version} · generated`,
            notes: `${result.itemCount} items with ${result.sourceCount} citations.`,
          },
        }).catch(() => null);
      }
      // Keep the job-scoped relevance view in step with the new draft (master resume untouched).
      await classifyMasterSkills({ data: { jobId } }).catch(() => null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: skillRelevanceQueryKey(jobId, user?.id) }),
        queryClient.invalidateQueries({ queryKey: ["tailored-preview", jobId, user?.id] }),
        queryClient.invalidateQueries({ queryKey: contentPriorityQueryKey(jobId, user?.id) }),
        queryClient.invalidateQueries({ queryKey: tailoringSettingsQueryKey(jobId, user?.id) }),
      ]);
      toast.success(
        `Generated v${result.version} — ${result.itemCount} items from ${result.candidateCount} ranked master resume entries.`,
      );
      await navigate({ to: "/jobs/$jobId/preview", params: { jobId } });
    } catch {
      toast.error("The generation run failed. Please retry.");
    } finally {
      setGenerating(false);
    }
  };

  const validate = async () => {
    const resumeId = dataQuery.data?.resume?.id;
    if (!resumeId) return;
    setValidating(true);
    try {
      const result = await validateTailoredResume({ data: { tailoredResumeId: resumeId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        `Validated ${result.checked} claims${result.aiUsed ? "" : " with deterministic checks only"}.`,
      );
    } catch {
      toast.error("The validation run failed. Please retry.");
    } finally {
      setValidating(false);
    }
  };

  if (dataQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (dataQuery.isError || !dataQuery.data?.job) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load the tailored resume for this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, profile, resume, items, sources, evidence, validations } = dataQuery.data;
  const validationByItem = new Map<string, ValidationRow>();
  for (const row of validations) {
    if (row.tailored_resume_item_id) validationByItem.set(row.tailored_resume_item_id, row);
  }
  const summary = validationSummary(validations.map((row) => ({ status: row.status })));
  const sourcesByItem = new Map<string, TailoredSourceRow[]>();
  for (const row of sources) {
    const list = sourcesByItem.get(row.tailored_resume_item_id) ?? [];
    list.push(row);
    sourcesByItem.set(row.tailored_resume_item_id, list);
  }

  const visibleItems = supportedOnly
    ? items.filter(
        (item) => (validationByItem.get(item.id)?.status ?? item.validation_status) === "supported",
      )
    : items;
  const excludedCount = items.length - visibleItems.length;

  const supportedItems = items.filter(
    (item) => (validationByItem.get(item.id)?.status ?? item.validation_status) === "supported",
  );

  const download = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resolveItemStatement = (item: TailoredItemRow) => {
    const status = validationByItem.get(item.id)?.status ?? item.validation_status;
    if (status === "unsupported") {
      // Revert to grounded master resume source text if available to preserve truthfulness
      return item.source_text?.trim() || item.statement;
    }
    return item.statement;
  };

  const exportItemsList = supportedOnly
    ? items.filter(
        (item) => (validationByItem.get(item.id)?.status ?? item.validation_status) === "supported",
      )
    : items;

  const professionalItems = () =>
    exportItemsList.map((item) => ({
      id: item.id,
      section: item.section,
      heading: item.heading,
      statement: resolveItemStatement(item),
      evidenceIds: (sourcesByItem.get(item.id) ?? [])
        .slice()
        .sort((a, b) => (a.support_type === "primary" ? -1 : b.support_type === "primary" ? 1 : 0))
        .map((source) => source.resume_evidence_id),
    }));

  const exportProfessional = async () => {
    if (!resume) return;
    setExporting("professional");
    try {
      const settings = normaliseSettings(resume.settings);
      const itemsToRender = professionalItems();
      const { blob, fileName } = buildProfessionalResumePdf({
        profile: profile ?? null,
        jobTitle: job.title ?? null,
        version: resume.version,
        paperSize: settings.paper_size,
        onePage: settings.resume_length === "one_page",
        evidence: evidence as unknown as Map<string, ProEvidence>,
        items: itemsToRender,
      });

      download(blob, fileName);

      const { data: exportRow, error } = await supabase
        .from("exports")
        .insert({
          user_id: user!.id,
          tailored_resume_id: resume.id,
          format: "pdf",
          file_name: fileName,
          status: supportedOnly ? "downloaded_professional_supported_only" : "downloaded_professional_complete",
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);

      await snapshotTailoredResume({
        data: {
          tailoredResumeId: resume.id,
          reason: "export",
          label: `v${resume.version} · PDF export`,
          supportedOnly,
          exportId: exportRow?.id ?? null,
          exportFormat: "pdf",
          notes: `Recruiter-ready PDF with ${itemsToRender.length} items${supportedOnly ? " (supported only)" : ""}.`,
        },
      }).catch(() => null);

      toast.success(`Professional resume exported with ${itemsToRender.length} items.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export failed. Please retry.");
    } finally {
      setExporting(null);
    }
  };

  const exportProfessionalDocx = async () => {
    if (!resume) return;
    setExporting("docx");
    try {
      const settings = normaliseSettings(resume.settings);
      const itemsToRender = professionalItems();
      const { buildProfessionalResumeDocx } = await import("@/lib/resume-docx-professional");
      const built = buildProfessionalResumeDocx({
        profile: profile ?? null,
        jobTitle: job.title ?? null,
        version: resume.version,
        paperSize: settings.paper_size,
        evidence: evidence as unknown as Map<string, ProEvidence>,
        items: itemsToRender,
      });
      download(await built.blob(), built.fileName);

      const { data: exportRow, error } = await supabase
        .from("exports")
        .insert({
          user_id: user!.id,
          tailored_resume_id: resume.id,
          format: "docx",
          file_name: built.fileName,
          status: supportedOnly ? "downloaded_professional_supported_only" : "downloaded_professional_complete",
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);

      await snapshotTailoredResume({
        data: {
          tailoredResumeId: resume.id,
          reason: "export",
          label: `v${resume.version} · Word export`,
          supportedOnly,
          exportId: exportRow?.id ?? null,
          exportFormat: "docx",
          notes: `Recruiter-ready Word document with ${itemsToRender.length} items${supportedOnly ? " (supported only)" : ""}.`,
        },
      }).catch(() => null);

      toast.success(`Word document exported with ${itemsToRender.length} items.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The Word export failed. Please retry.");
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (!resume) return;
    setExporting("audit");
    try {
      const { blob, fileName } = buildTailoredResumePdf({
        profile: profile ?? null,
        jobTitle: job.title ?? null,
        jobCompany: job.company ?? null,
        resumeTitle: resume.title,
        version: resume.version,
        supportedOnly,
        excludedCount,
        evidence,
        items: visibleItems.map((item) => ({
          id: item.id,
          section: item.section,
          heading: item.heading,
          statement: item.statement,
          validationStatus: validationByItem.get(item.id)?.status ?? item.validation_status,
          validationRationale: validationByItem.get(item.id)?.rationale ?? null,
          sources: (sourcesByItem.get(item.id) ?? []).map((source) => ({
            resume_evidence_id: source.resume_evidence_id,
            support_type: source.support_type,
            excerpt: source.excerpt,
          })),
        })),
      });

      download(blob, fileName);

      const { error } = await supabase.from("exports").insert({
        user_id: user!.id,
        tailored_resume_id: resume.id,
        format: "pdf",
        file_name: fileName,
        status: supportedOnly ? "downloaded_audit_supported_only" : "downloaded_audit_full_draft",
      });
      if (error) throw new Error(error.message);
      toast.success(
        `Audit export created for ${visibleItems.length} claims with evidence citations.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export failed. Please retry.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/jobs/$jobId/match"
          params={{ jobId }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to match report
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">Tailored resume</h1>
            <p className="text-sm text-muted-foreground">
              {[job.title, job.company].filter(Boolean).join(" · ")} — written only from evidence
              already in your master resume.
            </p>
          </div>
          <Button disabled={generating} onClick={() => void generate()}>
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                {resume ? "Generate new version" : "Generate tailored resume"}
              </>
            )}
          </Button>
        </div>
      </div>

      <TailoringSettingsCard jobId={jobId} />

      {!resume ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <FileCheck2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No tailored version yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generation ranks every Master Resume entry for this posting — high priority content
            leads, supporting and transferable evidence is retained, and missing requirements are
            never written in.
          </p>
        </div>
      ) : (
        <>
          {validations.length === 0 ? (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                <ShieldAlert className="size-5 text-amber-600" aria-hidden />
                <span className="font-medium">Pending evidence validation.</span>
                <span className="flex-1 text-muted-foreground">
                  Every line below cites the master resume evidence it came from, but no independent
                  claim check has run yet. Validate before sending this anywhere.
                </span>
                <Button size="sm" disabled={validating} onClick={() => void validate()}>
                  {validating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Validating…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" aria-hidden />
                      Validate claims
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card
              className={
                summary.unsupported > 0
                  ? "border-destructive/50 bg-destructive/5"
                  : summary.flagged > 0
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/5"
              }
            >
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {summary.unsupported > 0
                        ? `${summary.unsupported} unsupported claim${summary.unsupported === 1 ? "" : "s"} — do not send yet`
                        : summary.flagged > 0
                          ? `${summary.flagged} claim${summary.flagged === 1 ? "" : "s"} need your review`
                          : "Every claim is substantiated by cited evidence"}
                    </CardTitle>
                    <CardDescription>
                      Claim validation checks each line against its stored citations — wording,
                      scope, metrics, technology, employer and timeframe. Your master resume is
                      never changed.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={validating}
                    onClick={() => void validate()}
                  >
                    {validating ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Re-validating…
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="size-4" aria-hidden />
                        Re-validate
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 text-sm">
                {(
                  [
                    ["supported", summary.supported],
                    ["partially_supported", summary.partially_supported],
                    ["needs_review", summary.needs_review],
                    ["unsupported", summary.unsupported],
                  ] as const
                ).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center gap-2 rounded-md border bg-background px-3 py-2"
                  >
                    <StatusIcon status={status} />
                    <span className="font-mono text-sm">{count}</span>
                    <span className="text-xs text-muted-foreground">
                      {validationStatusLabel[status]}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  <span className="font-mono text-sm">{summary.total}</span>
                  <span className="text-xs text-muted-foreground">claims checked</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className={supportedOnly ? "border-[hsl(var(--evidence))]/60" : undefined}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    {supportedOnly ? "Final resume — supported claims only" : "Full working draft"}
                  </CardTitle>
                  <CardDescription>
                    {supportedOnly
                      ? `Showing only the ${visibleItems.length} claim${visibleItems.length === 1 ? "" : "s"} validated as supported. ${excludedCount} flagged item${excludedCount === 1 ? "" : "s"} are hidden from the final output but kept in the draft — nothing is deleted.`
                      : `Showing all ${items.length} generated claims, including any that are partially supported, unsupported or awaiting review.`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="supported-only"
                    checked={supportedOnly}
                    onCheckedChange={setSupportedOnly}
                  />
                  <Label htmlFor="supported-only" className="text-sm">
                    Supported only
                  </Label>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/5 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <FileCheck2 className="size-4 text-[hsl(var(--evidence))]" aria-hidden />
                    Professional resume — application ready
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recruiter-facing PDF for JobStreet, LinkedIn and direct applications. Clean
                    single-column ATS-friendly layout with selectable text. Uses only the{" "}
                    {supportedItems.length} claim
                    {supportedItems.length === 1 ? "" : "s"} validated as <strong>supported</strong>{" "}
                    — no evidence IDs, citations, statuses or internal notes appear anywhere in it.
                  </p>
                  <Button
                    className="mt-3"
                    disabled={exporting !== null || supportedItems.length === 0}
                    onClick={() => void exportProfessional()}
                  >
                    {exporting === "professional" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Building resume…
                      </>
                    ) : (
                      <>
                        <Download className="size-4" aria-hidden />
                        Download professional resume
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="mt-2 w-full"
                    disabled={exporting !== null || supportedItems.length === 0}
                    onClick={() => void exportProfessionalDocx()}
                  >
                    {exporting === "docx" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Building Word document…
                      </>
                    ) : (
                      <>
                        <Download className="size-4" aria-hidden />
                        Download Word (.docx)
                      </>
                    )}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    The Word version mirrors the same layout and content, and stays fully editable
                    in Microsoft Word and Google Docs.
                  </p>
                  {supportedItems.length === 0 ? (
                    <p className="mt-2 text-xs text-amber-600">
                      No claim is validated as supported yet, so there is nothing application-ready
                      to export. Validate the resume, then edit or rewrite the flagged claims until
                      they are substantiated.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border bg-secondary/30 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                    Audit / evidence export — internal review only
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The citation-rich traceability document: validation status per claim, citation
                    markers and the full evidence appendix with provenance. Follows the toggle above
                    ({supportedOnly ? "supported only" : "full working draft"},{" "}
                    {visibleItems.length} claim{visibleItems.length === 1 ? "" : "s"}). Not for
                    sending to employers.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    disabled={exporting !== null || visibleItems.length === 0}
                    onClick={() => void exportPdf()}
                  >
                    {exporting === "audit" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Exporting audit…
                      </>
                    ) : (
                      <>
                        <Download className="size-4" aria-hidden />
                        Download audit / evidence PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/jobs/$jobId/ats" params={{ jobId }}>
                    ATS &amp; readability check
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/jobs/$jobId/cover-letter" params={{ jobId }}>
                    Cover letter
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/jobs/$jobId/versions" params={{ jobId }}>
                    Version history
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/jobs/$jobId/preview" params={{ jobId }}>
                    Draft preview
                  </Link>
                </Button>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{resume.title}</CardTitle>
              <CardDescription>
                Settings used: {settingsSummary(normaliseSettings(resume.settings))}
                <br />
                Version {resume.version} · {items.length} generated items ·{" "}
                {Math.round((resume.match_score ?? 0) * 100)}% weighted requirement coverage ·{" "}
                {Math.round((resume.evidence_coverage ?? 0) * 100)}% exact coverage · master resume
                untouched.
              </CardDescription>
            </CardHeader>
          </Card>

          {TAILORED_SECTIONS.map((section) => {
            const sectionItems = visibleItems.filter((item) => item.section === section);
            if (sectionItems.length === 0) return null;
            return (
              <Card key={section}>
                <CardHeader>
                  <CardTitle className="text-base">{tailoredSectionLabel[section]}</CardTitle>
                  <CardDescription>
                    {section === "skill"
                      ? "Only skills that appear in your evidence, selected for this job. Skills left out here are still stored in full in your Master Resume — nothing is deleted or reordered there."
                      : "Each item is traceable to the evidence it was written from. Tailoring selects and reorders source evidence only; the source records stay unchanged."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sectionItems.map((item) => (
                    <div key={`${item.id}-wrap`} className="space-y-1">
                      {item.priority ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={priorityBadgeClass[item.priority as CompositionPriority]}
                          >
                            {priorityLabel[item.priority as CompositionPriority]}
                          </Badge>
                          {item.priority_rationale ? (
                            <span className="text-xs text-muted-foreground">
                              {item.priority_rationale}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <TailoredItemCard
                        key={item.id}
                        item={item}
                        sources={sourcesByItem.get(item.id) ?? []}
                        evidence={evidence}
                        validation={validationByItem.get(item.id)}
                        onChanged={async (reason) => {
                          await snapshotTailoredResume({
                            data: {
                              tailoredResumeId: resume!.id,
                              reason,
                              label: `v${resume!.version} · ${reason === "rewrite_accepted" ? "rewrite accepted" : "item edited"}`,
                            },
                          }).catch(() => null);
                          await queryClient.invalidateQueries({ queryKey });
                        }}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}

          <ContentPriorityPanel jobId={jobId} />
          <SkillRelevancePanel jobId={jobId} />
        </>
      )}
    </div>
  );
}
