import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  FileCheck2,
  Loader2,
  Quote,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateTailoredResume } from "@/lib/tailoring.functions";
import { validateTailoredResume } from "@/lib/validation.functions";
import {
  validationIssueLabel,
  validationStatusLabel,
  validationSummary,
  type ValidationRow,
} from "@/lib/validation";
import {
  tailoredSectionLabel,
  TAILORED_SECTIONS,
  type TailoredItemRow,
  type TailoredResumeRow,
  type TailoredSourceRow,
} from "@/lib/tailoring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

type EvidenceLite = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  content: string;
};

function StatusIcon({ status }: { status: string }) {
  if (status === "supported")
    return <CheckCircle2 className="size-4 text-[hsl(var(--evidence))]" aria-hidden />;
  if (status === "unsupported") return <XCircle className="size-4 text-destructive" aria-hidden />;
  if (status === "needs_review") return <CircleHelp className="size-4 text-amber-600" aria-hidden />;
  return <AlertTriangle className="size-4 text-amber-600" aria-hidden />;
}

function statusBadgeClass(status?: string) {
  if (status === "supported") return "border-[hsl(var(--evidence))] text-[hsl(var(--evidence))]";
  if (status === "unsupported") return "border-destructive text-destructive";
  if (status === "partially_supported" || status === "needs_review") return "border-amber-500 text-amber-600";
  return "";
}

function TailoredResumePage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const queryKey = ["tailored-resume", jobId, user?.id];

  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const job = await supabase.from("jobs").select("id, title, company").eq("id", jobId).maybeSingle();
      if (job.error) throw new Error(job.error.message);

      const resumes = await supabase
        .from("tailored_resumes")
        .select(
          "id, job_id, master_resume_id, title, status, generation_status, error_message, version, match_score, evidence_coverage, notes, created_at",
        )
        .eq("job_id", jobId)
        .order("version", { ascending: false })
        .limit(1);
      if (resumes.error) throw new Error(resumes.error.message);
      const resume = (resumes.data?.[0] ?? null) as TailoredResumeRow | null;
      if (!resume) {
        return {
          job: job.data,
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
          .select(
            "id, section, heading, statement, sort_order, is_evidence_backed, validation_status, rationale, confidence, source_text",
          )
          .eq("tailored_resume_id", resume.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tailored_resume_item_sources")
          .select("id, tailored_resume_item_id, resume_evidence_id, support_type, confidence, excerpt")
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
            .select("id, category, title, organization, role, start_date, end_date, content")
            .in("id", evidenceIds)
        : { data: [], error: null };
      if (evidence.error) throw new Error(evidence.error.message);

      return {
        job: job.data,
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
      await queryClient.invalidateQueries({ queryKey });
      toast.success(`Generated v${result.version} — ${result.itemCount} items with ${result.sourceCount} citations.`);
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

  const { job, resume, items, sources, evidence, validations } = dataQuery.data;
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
              {[job.title, job.company].filter(Boolean).join(" · ")} — written only from evidence already in your
              master resume.
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

      {!resume ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <FileCheck2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No tailored version yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generation reads this job's structured requirements and the match report's supporting evidence — exact
            matches first, related evidence kept in your own wording. Missing requirements are never written in.
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
                  Every line below cites the master resume evidence it came from, but no independent claim check has
                  run yet. Validate before sending this anywhere.
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
                      Claim validation checks each line against its stored citations — wording, scope, metrics,
                      technology, employer and timeframe. Your master resume is never changed.
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" disabled={validating} onClick={() => void validate()}>
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
                  <div key={status} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                    <StatusIcon status={status} />
                    <span className="font-mono text-sm">{count}</span>
                    <span className="text-xs text-muted-foreground">{validationStatusLabel[status]}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  <span className="font-mono text-sm">{summary.total}</span>
                  <span className="text-xs text-muted-foreground">claims checked</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{resume.title}</CardTitle>
              <CardDescription>
                Version {resume.version} · {items.length} generated items ·{" "}
                {Math.round((resume.match_score ?? 0) * 100)}% weighted requirement coverage ·{" "}
                {Math.round((resume.evidence_coverage ?? 0) * 100)}% exact coverage · master resume untouched.
              </CardDescription>
            </CardHeader>
          </Card>

          {TAILORED_SECTIONS.map((section) => {
            const sectionItems = items.filter((item) => item.section === section);
            if (sectionItems.length === 0) return null;
            return (
              <Card key={section}>
                <CardHeader>
                  <CardTitle className="text-base">{tailoredSectionLabel[section]}</CardTitle>
                  <CardDescription>
                    {section === "skill"
                      ? "Only skills that appear in your evidence."
                      : "Each item is traceable to the evidence it was written from."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sectionItems.map((item) => {
                    const itemSources = sourcesByItem.get(item.id) ?? [];
                    const validation = validationByItem.get(item.id);
                    if (itemSources.length === 0 && !validation) return null;
                    return (
                      <div key={item.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            {item.heading ? (
                              <p className="font-display text-sm font-semibold">{item.heading}</p>
                            ) : null}
                            <p className="text-sm leading-relaxed">{item.statement}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${statusBadgeClass(validation?.status)}`}>
                              {validationStatusLabel[validation?.status ?? item.validation_status] ??
                                item.validation_status}
                            </Badge>
                            {item.confidence !== null ? (
                              <span className="font-mono text-xs text-muted-foreground">
                                {Math.round(item.confidence * 100)}%
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {item.rationale ? (
                          <p className="mt-2 text-xs text-muted-foreground">{item.rationale}</p>
                        ) : null}

                        {validation ? (
                          <div
                            className={`mt-3 rounded-md border p-3 text-xs leading-relaxed ${
                              validation.status === "unsupported"
                                ? "border-destructive/50 bg-destructive/5"
                                : validation.status === "supported"
                                  ? "border-[hsl(var(--evidence))]/40 bg-[hsl(var(--evidence))]/5"
                                  : "border-amber-500/50 bg-amber-500/5"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusIcon status={validation.status} />
                              <span className="font-medium">{validationStatusLabel[validation.status]}</span>
                              {validation.confidence !== null ? (
                                <span className="font-mono text-muted-foreground">
                                  {Math.round(validation.confidence * 100)}% confidence
                                </span>
                              ) : null}
                              <span className="font-mono uppercase tracking-wide text-muted-foreground">
                                {validation.validator === "deterministic" ? "rule check" : "rule + AI check"}
                              </span>
                            </div>
                            {validation.rationale ? <p className="mt-2">{validation.rationale}</p> : null}
                            {validation.unsupported_spans.length > 0 ? (
                              <p className="mt-2">
                                <span className="font-medium">Not substantiated: </span>
                                {validation.unsupported_spans.map((span) => (
                                  <span
                                    key={span}
                                    className="mr-1 rounded bg-destructive/15 px-1 py-0.5 font-mono text-destructive"
                                  >
                                    {span}
                                  </span>
                                ))}
                              </p>
                            ) : null}
                            {validation.issues.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {validation.issues.map((issue) => (
                                  <li key={issue} className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                    <span>{validationIssueLabel[issue] ?? issue}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}

                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="mt-2 h-8 px-2 text-xs">
                              <Quote className="size-3.5" aria-hidden />
                              {itemSources.length} evidence citation{itemSources.length === 1 ? "" : "s"}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-2">
                            {itemSources.map((source) => {
                              const record = evidence.get(source.resume_evidence_id);
                              return (
                                <div
                                  key={source.id}
                                  className="rounded-md border bg-secondary/40 p-3 text-xs leading-relaxed"
                                >
                                  <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <span className="font-mono uppercase tracking-wide text-muted-foreground">
                                      {[record?.category, record?.role, record?.organization, record?.title]
                                        .filter(Boolean)
                                        .join(" · ") || "Evidence record"}
                                    </span>
                                    <Badge
                                      className={
                                        source.support_type === "primary"
                                          ? "bg-[hsl(var(--evidence))] text-[hsl(var(--evidence-foreground))]"
                                          : "bg-amber-500 text-white"
                                      }
                                    >
                                      {source.support_type === "primary" ? "Exact support" : "Related support"}
                                    </Badge>
                                  </div>
                                  <p>{source.excerpt ?? record?.content}</p>
                                </div>
                              );
                            })}
                            {itemSources.length === 0 ? (
                              <p className="text-xs text-destructive">No citation recorded for this item.</p>
                            ) : null}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
