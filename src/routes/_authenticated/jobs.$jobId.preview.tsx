import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText, RefreshCcw, ShieldCheck, SquarePen } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  tailoredSectionLabel,
  TAILORED_SECTIONS,
  type TailoredItemRow,
  type TailoredResumeRow,
} from "@/lib/tailoring";
import { MASTER_IMMUTABILITY_NOTE } from "@/lib/skill-relevance";
import { SkillRelevancePanel } from "@/components/jobs/SkillRelevancePanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/preview")({
  head: () => ({
    meta: [
      { title: "Tailored Draft Preview — MauJobFit" },
      {
        name: "description",
        content:
          "Preview a freshly generated tailored resume draft before editing or validating it, with the per-job skill relevance view.",
      },
      { property: "og:title", content: "Tailored Draft Preview — MauJobFit" },
      {
        property: "og:description",
        content: "The first look at a generated tailored resume draft, straight after tailoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DraftPreviewPage,
});

function DraftPreviewPage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();

  const previewQuery = useQuery({
    queryKey: ["tailored-preview", jobId, user?.id],
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
      if (!resume) return { job: job.data, resume: null, items: [] as TailoredItemRow[] };

      const items = await supabase
        .from("tailored_resume_items")
        .select(
          "id, section, heading, statement, sort_order, is_evidence_backed, validation_status, rationale, confidence, source_text",
        )
        .eq("tailored_resume_id", resume.id)
        .order("sort_order", { ascending: true });
      if (items.error) throw new Error(items.error.message);

      return { job: job.data, resume, items: (items.data ?? []) as TailoredItemRow[] };
    },
    enabled: !!user,
  });

  if (previewQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (previewQuery.isError || !previewQuery.data?.job) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load the draft preview for this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void previewQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, resume, items } = previewQuery.data;
  const skillItems = items.filter((item) => item.section === "skill");

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/jobs/$jobId/match"
          params={{ jobId }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to job match
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">Draft preview</h1>
            <p className="text-sm text-muted-foreground">
              {[job.title, job.company].filter(Boolean).join(" · ")} — the freshly generated draft, before any editing
              or validation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild disabled={!resume}>
              <Link to="/jobs/$jobId/tailored" params={{ jobId }}>
                <SquarePen className="size-4" aria-hidden />
                Edit &amp; finalize
              </Link>
            </Button>
            <Button asChild variant="outline" disabled={!resume}>
              <Link to="/jobs/$jobId/tailored" params={{ jobId }}>
                <ShieldCheck className="size-4" aria-hidden />
                Validate claims
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/jobs/$jobId/match" params={{ jobId }}>
                Return to job match
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {!resume ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <FileText className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">Nothing generated yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generate a tailored resume from the tailored resume page and you'll land back here for a first read of the
            draft.
          </p>
          <Button asChild className="mt-4">
            <Link to="/jobs/$jobId/tailored" params={{ jobId }}>
              Go to tailoring
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <Card className="border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/5">
            <CardHeader>
              <CardTitle className="text-base">{resume.title}</CardTitle>
              <CardDescription>
                Version {resume.version} · {items.length} generated items · draft, not yet validated.{" "}
                {MASTER_IMMUTABILITY_NOTE}
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
                      ? "Selected from your master resume skills for this job — the rest stay in the Master Resume."
                      : "Selected and reordered from your master resume evidence. Source records are unchanged."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section === "skill" ? (
                    <ul className="flex flex-wrap gap-2">
                      {sectionItems.map((item) => (
                        <li key={item.id}>
                          <Badge variant="secondary" className="text-sm font-normal">
                            {item.statement}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    sectionItems.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-background p-4">
                        {item.heading ? <p className="text-sm font-medium">{item.heading}</p> : null}
                        <p className="mt-1 text-sm text-muted-foreground">{item.statement}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}

          {skillItems.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              This draft presents {skillItems.length} skill{skillItems.length === 1 ? "" : "s"}. Skills left out of the
              draft are still stored in full in your Master Resume — see the relevance breakdown below.
            </p>
          ) : null}
        </>
      )}

      <SkillRelevancePanel jobId={jobId} />
    </div>
  );
}
