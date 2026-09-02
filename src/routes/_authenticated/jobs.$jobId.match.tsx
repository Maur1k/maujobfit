import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Loader2,
  RefreshCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { computeJobMatch } from "@/lib/matching.functions";
import { classifyMasterSkills } from "@/lib/skill-relevance.functions";
import { SkillRelevancePanel, skillRelevanceQueryKey } from "@/components/jobs/SkillRelevancePanel";
import { coverageSummary, matchStatusLabel, type MatchStatus } from "@/lib/matching";
import { requirementTypeLabelPlural, type JobRequirementRow } from "@/lib/job-analysis";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/match")({
  head: () => ({
    meta: [
      { title: "Match Report — MauJobFit" },
      {
        name: "description",
        content:
          "An explainable match report: every job requirement marked exact, related or missing, with the resume evidence that supports it.",
      },
      { property: "og:title", content: "Match Report — MauJobFit" },
      {
        property: "og:description",
        content: "Requirement-by-requirement match between a job posting and your master resume evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatchReport,
});

const REQUIREMENT_ORDER = ["required_skill", "preferred_skill", "responsibility", "qualification"] as const;

type EvidenceLite = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  content: string;
  evidence_kind: string;
};

type MatchRow = {
  id: string;
  job_requirement_id: string | null;
  resume_evidence_id: string | null;
  status: string | null;
  score: number | null;
  rationale: string | null;
  evidence_excerpt: string | null;
};

const statusStyle: Record<MatchStatus, { icon: typeof CheckCircle2; className: string; badge: string }> = {
  exact: {
    icon: CheckCircle2,
    className: "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/5",
    badge: "bg-[hsl(var(--evidence))] text-[hsl(var(--evidence-foreground))]",
  },
  related: {
    icon: AlertTriangle,
    className: "border-amber-500/50 bg-amber-500/5",
    badge: "bg-amber-500 text-white",
  },
  missing: {
    icon: XCircle,
    className: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive text-destructive-foreground",
  },
};

function MatchReport() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const reportQuery = useQuery({
    queryKey: ["match-report", jobId, user?.id],
    queryFn: async () => {
      const [job, requirements, matches, evidence] = await Promise.all([
        supabase.from("jobs").select("id, title, company, analysis_status").eq("id", jobId).maybeSingle(),
        supabase
          .from("job_requirements")
          .select(
            "id, job_id, requirement, requirement_type, importance, keywords, canonical_skill, aliases, related_skills, sort_order",
          )
          .eq("job_id", jobId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("match_results")
          .select("id, job_requirement_id, resume_evidence_id, status, score, rationale, evidence_excerpt")
          .eq("job_id", jobId),
        supabase
          .from("resume_evidence")
          .select("id, category, title, organization, role, content, evidence_kind"),
      ]);
      if (job.error) throw new Error(job.error.message);
      if (requirements.error) throw new Error(requirements.error.message);
      if (matches.error) throw new Error(matches.error.message);
      if (evidence.error) throw new Error(evidence.error.message);
      return {
        job: job.data,
        requirements: (requirements.data ?? []) as JobRequirementRow[],
        matches: (matches.data ?? []) as MatchRow[],
        evidence: new Map(((evidence.data ?? []) as EvidenceLite[]).map((row) => [row.id, row])),
      };
    },
    enabled: !!user,
  });

  const run = async () => {
    setRunning(true);
    try {
      const result = await computeJobMatch({ data: { jobId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Job-scoped relevance layer: classifies master skills without touching them.
      await classifyMasterSkills({ data: { jobId } }).catch(() => null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["match-report", jobId, user?.id] }),
        queryClient.invalidateQueries({ queryKey: skillRelevanceQueryKey(jobId, user?.id) }),
      ]);
      toast.success(`Matched ${result.requirementCount} requirements against your master resume.`);
    } catch {
      toast.error("The match run failed. Please retry.");
    } finally {
      setRunning(false);
    }
  };

  if (reportQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data?.job) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load this match report.</p>
        <Button variant="outline" className="mt-4" onClick={() => void reportQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, requirements, matches, evidence } = reportQuery.data;
  const byRequirement = new Map<string, MatchRow[]>();
  for (const row of matches) {
    if (!row.job_requirement_id) continue;
    const list = byRequirement.get(row.job_requirement_id) ?? [];
    list.push(row);
    byRequirement.set(row.job_requirement_id, list);
  }
  const perRequirement = requirements
    .map((requirement) => byRequirement.get(requirement.id)?.[0])
    .filter(Boolean) as MatchRow[];
  const summary = coverageSummary(perRequirement);
  const hasReport = perRequirement.length > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/jobs/$jobId"
          params={{ jobId }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to job analysis
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">Match report</h1>
            <p className="text-sm text-muted-foreground">
              {[job.title, job.company].filter(Boolean).join(" · ")} — matched against your master resume
              evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={hasReport ? "default" : "outline"} asChild disabled={!hasReport}>
              <Link to="/jobs/$jobId/tailored" params={{ jobId }}>
                <FileCheck2 className="size-4" aria-hidden />
                Tailored resume
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId/preview" params={{ jobId }}>
                Draft preview
              </Link>
            </Button>
            <Button variant="outline" disabled={running} onClick={() => void run()}>
              {running ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {hasReport ? "Re-run match" : "Run match"}
            </Button>
          </div>
        </div>
      </div>

      {hasReport ? (
        <Card>
          <CardHeader>
            <CardTitle>Coverage</CardTitle>
            <CardDescription>
              {summary.exact} exact · {summary.related} related · {summary.missing} missing across{" "}
              {summary.total} requirements. Related evidence is adjacent, never counted as equivalent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              {(["exact", "related", "missing"] as MatchStatus[]).map((status) => {
                const value = summary[status];
                if (value === 0) return null;
                return (
                  <div
                    key={status}
                    className={statusStyle[status].badge}
                    style={{ width: `${(value / summary.total) * 100}%` }}
                    title={`${matchStatusLabel[status]}: ${value}`}
                  />
                );
              })}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Weighted coverage score: {Math.round(summary.score * 100)}% (exact counts full, related counts
              half).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
          <Sparkles className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-display text-lg font-semibold">No match report yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Run the match to compare every requirement of this posting against your master resume evidence.
            Nothing is invented — requirements without evidence are labeled missing.
          </p>
        </div>
      )}

      <SkillRelevancePanel jobId={jobId} />



      {REQUIREMENT_ORDER.map((type) => {
        const rows = requirements.filter((requirement) => requirement.requirement_type === type);
        if (rows.length === 0) return null;
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle>{requirementTypeLabelPlural[type]}</CardTitle>
              <CardDescription>Each requirement with its status, cited evidence and rationale.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((requirement) => {
                const results = byRequirement.get(requirement.id) ?? [];
                const first = results[0];
                const status = (first?.status ?? "missing") as MatchStatus;
                const style = statusStyle[status];
                const Icon = style.icon;
                return (
                  <div key={requirement.id} className={`rounded-lg border p-4 ${first ? style.className : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        {first ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
                        <span className="font-medium">{requirement.requirement}</span>
                      </div>
                      {first ? (
                        <div className="flex items-center gap-2">
                          <Badge className={style.badge}>{matchStatusLabel[status]}</Badge>
                          {first.score !== null ? (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              confidence {Math.round(Number(first.score) * 100)}%
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="secondary">Not evaluated</Badge>
                      )}
                    </div>

                    {first?.rationale ? (
                      <p className="mt-2 text-sm text-muted-foreground">{first.rationale}</p>
                    ) : null}

                    {status === "missing" && first ? (
                      <p className="mt-2 text-xs font-medium text-destructive">
                        No supporting evidence — nothing cited.
                      </p>
                    ) : null}

                    {results.filter((row) => row.resume_evidence_id).length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {results
                          .filter((row) => row.resume_evidence_id)
                          .map((row) => {
                            const source = evidence.get(row.resume_evidence_id!);
                            return (
                              <li key={row.id} className="rounded-md border border-border bg-background p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  {source
                                    ? [source.category, source.role, source.title, source.organization]
                                        .filter(Boolean)
                                        .join(" · ")
                                    : "Evidence record"}
                                </p>
                                <p className="mt-1 text-sm">
                                  {row.evidence_excerpt ?? source?.content ?? "Evidence text unavailable."}
                                </p>
                              </li>
                            );
                          })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
