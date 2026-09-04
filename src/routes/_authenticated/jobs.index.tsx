import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Briefcase, Loader2, RefreshCcw, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { analyzeJobDescription } from "@/lib/job-analysis.functions";
import {
  MAX_JOB_TEXT_LENGTH,
  MIN_JOB_TEXT_LENGTH,
  analysisStatusLabel,
  type JobRow,
} from "@/lib/job-analysis";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({
    meta: [
      { title: "Job Descriptions — MauJobFit" },
      {
        name: "description",
        content:
          "Paste a job posting and MauJobFit structures it into required skills, preferred skills, responsibilities and keywords.",
      },
      { property: "og:title", content: "Job Descriptions — MauJobFit" },
      {
        property: "og:description",
        content: "Turn a pasted job posting into a structured, normalized requirements record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JobsPage,
});

const JOB_COLUMNS =
  "id, title, company, location, employment_type, source_url, description, raw_text, seniority, keywords, status, analysis_status, error_message, created_at, updated_at";

function JobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<JobRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ["jobs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(JOB_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as JobRow[];
    },
    enabled: !!user,
  });

  const charCount = rawText.replace(/\s+/g, "").length;
  const tooShort = charCount < MIN_JOB_TEXT_LENGTH;

  const analyze = async (jobId?: string, text?: string) => {
    const payloadText = text ?? rawText;
    setAnalyzing(true);
    try {
      const result = await analyzeJobDescription({
        data: {
          rawText: payloadText,
          sourceUrl: sourceUrl.trim() || null,
          jobId: jobId ?? null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["jobs", user?.id] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Analyzed — ${result.requirementCount} structured requirements`);
      if (!jobId) {
        setRawText("");
        setSourceUrl("");
      }
      navigate({ to: "/jobs/$jobId", params: { jobId: result.jobId } });
    } catch {
      toast.error("The analysis request failed. Check your connection and retry.");
    } finally {
      setAnalyzing(false);
    }
  };

  const retry = async (job: JobRow) => {
    if (!job.raw_text) {
      toast.error("The original posting text is missing for this job. Paste it again below.");
      return;
    }
    await analyze(job.id, job.raw_text);
  };

  const confirmDelete = async () => {
    if (!jobToDelete) return;
    setDeleting(true);
    try {
      // Remove tailored resumes generated for this job first so no orphaned
      // drafts, exports or cover letters are left behind (cascade handles children).
      const { error: tailoredError } = await supabase
        .from("tailored_resumes")
        .delete()
        .eq("job_id", jobToDelete.id);
      if (tailoredError) throw new Error(tailoredError.message);

      const { error } = await supabase.from("jobs").delete().eq("id", jobToDelete.id);
      if (error) throw new Error(error.message);

      await queryClient.invalidateQueries({ queryKey: ["jobs", user?.id] });
      toast.success(`Deleted "${jobToDelete.title}"`);
      setJobToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't delete that job. Please retry.",
      );
    } finally {
      setDeleting(false);
    }
  };


  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Job descriptions</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Paste a posting from JobStreet, LinkedIn or anywhere else. MauJobFit stores the original
          text and structures it into normalized requirements — nothing about your Master Resume
          changes here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analyze a job description</CardTitle>
          <CardDescription>
            Paste the full posting text. Skill names are normalized against a canonical taxonomy, so
            React / React.js / ReactJS all become one skill.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-url">Source URL (optional)</Label>
            <Input
              id="job-url"
              placeholder="https://www.jobstreet.com.ph/job/…"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-text">Job description</Label>
            <Textarea
              id="job-text"
              rows={12}
              placeholder="Paste the whole posting here — title, responsibilities, requirements, qualifications…"
              value={rawText}
              maxLength={MAX_JOB_TEXT_LENGTH}
              onChange={(event) => setRawText(event.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {charCount} characters
              {tooShort ? ` · need at least ${MIN_JOB_TEXT_LENGTH} to analyze` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void analyze()} disabled={analyzing || tooShort}>
              {analyzing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              Analyze Job
            </Button>
            {rawText.length > 0 ? (
              <Button variant="ghost" onClick={() => setRawText("")} disabled={analyzing}>
                Clear
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analyzed jobs</CardTitle>
          <CardDescription>Every posting you have analyzed, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobsQuery.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : jobsQuery.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
              <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
              <p className="mt-3 text-sm">We couldn't load your jobs.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void jobsQuery.refetch()}
              >
                <RefreshCcw className="size-4" aria-hidden />
                Retry
              </Button>
            </div>
          ) : jobsQuery.data && jobsQuery.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {jobsQuery.data.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: job.id }}
                      className="font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[job.company, job.location, job.seniority, job.employment_type]
                        .filter(Boolean)
                        .join(" · ") || "No company details detected"}
                    </p>
                    {job.analysis_status === "failed" && job.error_message ? (
                      <p className="text-xs text-destructive">{job.error_message}</p>
                    ) : null}
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
                    {job.analysis_status === "failed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={analyzing}
                        onClick={() => void retry(job)}
                      >
                        <RefreshCcw className="size-4" aria-hidden />
                        Retry
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/jobs/$jobId" params={{ jobId: job.id }}>
                          View
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="default">
                      <Link to="/jobs/$jobId/apply" params={{ jobId: job.id }}>
                        <SendHorizontal className="size-4" aria-hidden />
                        Apply
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${job.title}`}
                      disabled={deleting}
                      onClick={() => setJobToDelete(job)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only sm:not-sr-only">Delete</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
              <Briefcase className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-4 font-display text-lg font-semibold">No jobs analyzed yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Paste a job description above to see its required skills, preferred skills,
                responsibilities and keywords structured for later matching.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!jobToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setJobToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              "{jobToDelete?.title}" and everything generated from it — requirements, match report,
              tailored resume drafts, cover letters and exports — will be permanently removed. Your
              Master Resume is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
