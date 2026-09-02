import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash, Gauge, Link2, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { analyzeAtsFit } from "@/lib/ats.functions";
import { scoreLabel, type AtsAnalysisRow, type KeywordFinding } from "@/lib/ats";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/ats")({
  head: () => ({
    meta: [
      { title: "ATS & Readability Check — MauJobFit" },
      {
        name: "description",
        content:
          "Score your supported-only tailored resume against the saved job description: keyword coverage, requirement coverage, readability and grounded suggested edits.",
      },
      { property: "og:title", content: "ATS & Readability Check — MauJobFit" },
      {
        property: "og:description",
        content: "Transparent ATS scoring with suggestions grounded only in your own stored evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AtsPage,
});

function ScoreCard({ label, score, hint }: { label: string; score: number | null; hint: string }) {
  const value = Math.round((score ?? 0) * 100);
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}%</p>
      <Progress value={value} className="mt-2" />
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function KeywordChips({ findings, status }: { findings: KeywordFinding[]; status: KeywordFinding["status"] }) {
  const rows = findings.filter((row) => row.status === status);
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">None.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((row) => (
        <Badge
          key={`${status}-${row.canonical}`}
          variant="outline"
          className={
            status === "exact"
              ? "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/10"
              : status === "related"
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-destructive/40 bg-destructive/5"
          }
        >
          {row.canonical}
          {row.via.length ? <span className="ml-1 text-[10px] text-muted-foreground">~ {row.via.join(", ")}</span> : null}
        </Badge>
      ))}
    </div>
  );
}

function AtsPage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const queryKey = ["ats-analysis", jobId, user?.id];

  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const job = await supabase.from("jobs").select("id, title, company").eq("id", jobId).maybeSingle();
      if (job.error) throw new Error(job.error.message);

      const resumes = await supabase
        .from("tailored_resumes")
        .select("id, title, version")
        .eq("job_id", jobId)
        .order("version", { ascending: false })
        .limit(1);
      if (resumes.error) throw new Error(resumes.error.message);
      const resume = resumes.data?.[0] ?? null;
      if (!resume) return { job: job.data, resume: null, analysis: null as AtsAnalysisRow | null, supportedCount: 0 };

      const [analyses, items] = await Promise.all([
        supabase
          .from("ats_analyses")
          .select("*")
          .eq("tailored_resume_id", resume.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("tailored_resume_items")
          .select("id, validation_status")
          .eq("tailored_resume_id", resume.id),
      ]);
      if (analyses.error) throw new Error(analyses.error.message);
      if (items.error) throw new Error(items.error.message);

      return {
        job: job.data,
        resume,
        analysis: (analyses.data?.[0] ?? null) as AtsAnalysisRow | null,
        supportedCount: (items.data ?? []).filter((row) => row.validation_status === "supported").length,
      };
    },
    enabled: !!user,
  });

  const run = async () => {
    const resumeId = dataQuery.data?.resume?.id;
    if (!resumeId) return;
    setRunning(true);
    try {
      const result = await analyzeAtsFit({ data: { tailoredResumeId: resumeId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(`ATS fit scored ${Math.round(result.overall * 100)}% with ${result.suggestionCount} suggestions.`);
    } catch {
      toast.error("The ATS analysis failed. Please retry.");
    } finally {
      setRunning(false);
    }
  };

  if (dataQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (dataQuery.isError || !dataQuery.data?.job) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load the ATS check for this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, resume, analysis, supportedCount } = dataQuery.data;
  const keywordFindings = (analysis?.readability?.keywords ?? []) as KeywordFinding[];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/jobs/$jobId/tailored"
          params={{ jobId }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to tailored resume
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">ATS &amp; readability check</h1>
            <p className="text-sm text-muted-foreground">
              {[job.title, job.company].filter(Boolean).join(" · ")} — scores only the supported claims that go into your
              application-ready resume, against this job's structured requirements.
            </p>
          </div>
          <Button disabled={running || !resume || supportedCount === 0} onClick={() => void run()}>
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                {analysis ? "Re-run analysis" : "Run ATS analysis"}
              </>
            )}
          </Button>
        </div>
      </div>

      {!resume ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <Gauge className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No tailored resume yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generate and validate a tailored resume for this job first — the ATS check only reads claims validated as
            supported.
          </p>
        </div>
      ) : supportedCount === 0 ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-8 text-center">
          <AlertTriangle className="mx-auto size-6 text-amber-600" aria-hidden />
          <p className="mt-3 font-medium">Nothing is validated as supported yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            The ATS check scores the application-ready content only. Validate the tailored resume and resolve the flagged
            claims, then come back.
          </p>
        </div>
      ) : !analysis ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <Gauge className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No analysis saved yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Run the analysis to score keyword coverage, requirement coverage and readability across your{" "}
            {supportedCount} supported claim{supportedCount === 1 ? "" : "s"}.
          </p>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Overall ATS fit: {Math.round((analysis.overall_score ?? 0) * 100)}% — {scoreLabel(analysis.overall_score ?? 0)}
                  </CardTitle>
                  <CardDescription>
                    Weighted 40% keyword coverage, 40% requirement coverage, 20% readability across{" "}
                    {analysis.analysed_items} supported claim{analysis.analysed_items === 1 ? "" : "s"}. Saved{" "}
                    {new Date(analysis.created_at).toLocaleString()}
                    {analysis.ai_used ? "" : " · suggestions from deterministic checks only"}.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ScoreCard
                label="Overall"
                score={analysis.overall_score}
                hint="How likely this resume reads as a fit to an ATS and a screener."
              />
              <ScoreCard
                label="Keyword coverage"
                score={analysis.keyword_score}
                hint="Job keywords literally present, weighted by importance. Related-only counts half."
              />
              <ScoreCard
                label="Requirement coverage"
                score={analysis.requirement_score}
                hint="Structured requirements addressed by supported content."
              />
              <ScoreCard
                label="Readability"
                score={analysis.readability_score}
                hint="Bullet length, strong verbs, voice and pronoun conventions."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Keywords</CardTitle>
              <CardDescription>
                Exact means the term itself appears. Related means only an adjacent skill appears — it is never counted as
                an exact match. Missing means the term is absent from your supported content.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-[hsl(var(--evidence))]" aria-hidden />
                  Exact matches ({analysis.matched_keywords.length})
                </p>
                <KeywordChips findings={keywordFindings} status="exact" />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Link2 className="size-4 text-amber-600" aria-hidden />
                  Related coverage ({analysis.related_keywords.length})
                </p>
                <KeywordChips findings={keywordFindings} status="related" />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CircleSlash className="size-4 text-destructive" aria-hidden />
                  Missing ({analysis.missing_keywords.length})
                </p>
                <KeywordChips findings={keywordFindings} status="missing" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requirement coverage</CardTitle>
              <CardDescription>Every structured requirement from the saved job description.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {analysis.requirement_findings.map((row, index) => (
                <div key={`${index}-${row.requirement}`} className="rounded-md border bg-background p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm">{row.requirement}</p>
                    <Badge
                      variant="outline"
                      className={
                        row.status === "exact"
                          ? "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/10"
                          : row.status === "related"
                            ? "border-amber-500/50 bg-amber-500/10"
                            : "border-destructive/40 bg-destructive/5"
                      }
                    >
                      {row.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                  {row.covered_by.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">Covered by: {row.covered_by.join("; ")}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Readability</CardTitle>
              <CardDescription>
                {analysis.readability.items} narrative line{analysis.readability.items === 1 ? "" : "s"} ·{" "}
                {analysis.readability.words} words · {analysis.readability.avg_words_per_bullet} words per bullet on
                average.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(analysis.readability.notes ?? []).map((note, index) => (
                <p key={index} className="text-muted-foreground">
                  · {note}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggested edits</CardTitle>
              <CardDescription>
                Every suggested addition or rewrite is grounded in evidence already stored behind your supported claims.
                Nothing here asks you to invent a skill or an experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suggestions — nothing actionable was found.</p>
              ) : (
                analysis.suggestions.map((row, index) => (
                  <div key={index} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{row.kind}</Badge>
                      {row.target ? <span className="text-xs text-muted-foreground">{row.target}</span> : null}
                    </div>
                    <p className="mt-2 text-sm">{row.suggestion}</p>
                    {row.rationale ? <p className="mt-1 text-xs text-muted-foreground">{row.rationale}</p> : null}
                    {row.grounded_in.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Grounded in {row.grounded_in.length} stored evidence record
                        {row.grounded_in.length === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
