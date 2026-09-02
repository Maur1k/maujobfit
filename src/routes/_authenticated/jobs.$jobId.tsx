import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { analyzeJobDescription } from "@/lib/job-analysis.functions";
import {
  REQUIREMENT_TYPES,
  analysisStatusLabel,
  requirementTypeLabel,
  type JobRequirementRow,
  type JobRow,
} from "@/lib/job-analysis";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Job Analysis — MauJobFit" },
      {
        name: "description",
        content:
          "Structured requirements for an analyzed job posting: required skills, preferred skills, responsibilities and keywords.",
      },
      { property: "og:title", content: "Job Analysis — MauJobFit" },
      {
        property: "og:description",
        content: "Normalized requirements extracted from a pasted job posting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JobDetail,
});

const JOB_COLUMNS =
  "id, title, company, location, employment_type, source_url, description, raw_text, seniority, keywords, status, analysis_status, error_message, created_at, updated_at";

function JobDetail() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const jobQuery = useQuery({
    queryKey: ["job", jobId, user?.id],
    queryFn: async () => {
      const [job, requirements] = await Promise.all([
        supabase.from("jobs").select(JOB_COLUMNS).eq("id", jobId).maybeSingle(),
        supabase
          .from("job_requirements")
          .select(
            "id, job_id, requirement, requirement_type, importance, keywords, canonical_skill, aliases, related_skills, sort_order",
          )
          .eq("job_id", jobId)
          .order("sort_order", { ascending: true }),
      ]);
      if (job.error) throw new Error(job.error.message);
      if (requirements.error) throw new Error(requirements.error.message);
      return {
        job: (job.data as JobRow | null) ?? null,
        requirements: (requirements.data ?? []) as JobRequirementRow[],
      };
    },
    enabled: !!user,
  });

  const job = jobQuery.data?.job ?? null;

  const retry = async () => {
    if (!job?.raw_text) {
      toast.error("The original posting text is missing. Paste it again on the jobs page.");
      return;
    }
    setRetrying(true);
    try {
      const result = await analyzeJobDescription({
        data: { rawText: job.raw_text, jobId: job.id, sourceUrl: job.source_url },
      });
      await queryClient.invalidateQueries({ queryKey: ["job", jobId, user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["jobs", user?.id] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Re-analyzed this posting.");
    } catch {
      toast.error("The analysis request failed. Please retry.");
    } finally {
      setRetrying(false);
    }
  };

  if (jobQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (jobQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void jobQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-display text-lg font-semibold">Job not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or it belongs to another account.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/jobs">Back to jobs</Link>
        </Button>
      </div>
    );
  }

  const requirements = jobQuery.data?.requirements ?? [];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/jobs"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All jobs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">{job.title}</h1>
            <p className="text-sm text-muted-foreground">
              {[job.company, job.location, job.seniority, job.employment_type]
                .filter(Boolean)
                .join(" · ") || "No company details detected"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                job.analysis_status === "ready"
                  ? "default"
                  : job.analysis_status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {analysisStatusLabel(job.analysis_status)}
            </Badge>
            <Button variant="outline" size="sm" disabled={retrying} onClick={() => void retry()}>
              {retrying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCcw className="size-4" aria-hidden />
              )}
              Re-analyze
            </Button>
          </div>
        </div>
        {job.source_url ? (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {job.source_url}
          </a>
        ) : null}
      </div>

      {job.analysis_status === "failed" && job.error_message ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" aria-hidden />
            Analysis failed
          </p>
          <p className="mt-1 text-muted-foreground">{job.error_message}</p>
        </div>
      ) : null}

      {job.description ? (
        <Card>
          <CardHeader>
            <CardTitle>Role summary</CardTitle>
            <CardDescription>Summarised from the posting text.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{job.description}</p>
          </CardContent>
        </Card>
      ) : null}

      {REQUIREMENT_TYPES.map((type) => {
        const rows = requirements.filter((row) => row.requirement_type === type);
        if (rows.length === 0) return null;
        const isSkill = type === "required_skill" || type === "preferred_skill";
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle>{requirementTypeLabel[type]}s</CardTitle>
              <CardDescription>
                {isSkill
                  ? "Normalized to canonical skill names. Related skills are adjacent, not equivalent."
                  : "Captured close to the source wording."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.requirement}</span>
                      {isSkill && !row.canonical_skill ? (
                        <Badge variant="secondary" className="text-[10px]">
                          unmapped
                        </Badge>
                      ) : null}
                    </div>
                    {row.aliases.length > 0 ? (
                      <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                        aliases: {row.aliases.join(", ")}
                      </p>
                    ) : null}
                    {row.related_skills.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        related (not equal): {row.related_skills.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {job.keywords.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>ATS-relevant terms detected in the posting.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {job.keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {job.raw_text ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Original pasted text</CardTitle>
              <CardDescription>Stored verbatim so nothing is invented downstream.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowRaw((value) => !value)}>
              {showRaw ? "Hide" : "Show"}
            </Button>
          </CardHeader>
          {showRaw ? (
            <CardContent>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-secondary/40 p-4 font-mono text-xs">
                {job.raw_text}
              </pre>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {requirements.length === 0 && job.analysis_status === "ready" ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          The analysis returned no structured requirements. Re-analyze, or paste a fuller copy of the
          posting.
        </div>
      ) : null}
    </div>
  );
}
