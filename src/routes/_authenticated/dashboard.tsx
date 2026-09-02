import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Briefcase,
  ExternalLink,
  FileStack,
  FileUp,
  History,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EvidencePrinciple } from "@/components/EvidencePrinciple";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MauJobFit" },
      {
        name: "description",
        content:
          "See your master resume status, evidence coverage and recent tailoring activity in one place.",
      },
      { property: "og:title", content: "Dashboard — MauJobFit" },
      {
        property: "og:description",
        content: "Master resume status and recent tailoring activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const { data, isPending } = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: async () => {
      const [master, evidence, tailored, jobs] = await Promise.all([
        supabase
          .from("master_resumes")
          .select("id, title, status, updated_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("resume_evidence").select("id", { count: "exact", head: true }),
        supabase
          .from("tailored_resumes")
          .select("id, job_id, title, status, match_score, version, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("jobs").select("id", { count: "exact", head: true }),
      ]);
      return {
        master: master.data,
        evidenceCount: evidence.count ?? 0,
        tailored: tailored.data ?? [],
        jobCount: jobs.count ?? 0,
      };
    },
    enabled: !!user,
  });

  const firstName = (user?.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">
            {firstName ? `Welcome, ${firstName}` : "Welcome"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your Master Resume is the immutable evidence source for all tailored applications.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/master-resume">
              <FileStack className="size-4 mr-1.5" aria-hidden />
              Master Resume
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/jobs">
              <Sparkles className="size-4 mr-1.5" aria-hidden />
              Analyze New Job
            </Link>
          </Button>
        </div>
      </div>

      <EvidencePrinciple />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Evidence records",
            value: data?.evidenceCount ?? 0,
            icon: ShieldCheck,
            to: "/master-resume" as const,
          },
          {
            label: "Target jobs",
            value: data?.jobCount ?? 0,
            icon: Briefcase,
            to: "/jobs" as const,
          },
          {
            label: "Tailored resumes",
            value: data?.tailored.length ?? 0,
            icon: FileStack,
            to: "/jobs" as const,
          },
        ].map(({ label, value, icon: Icon, to }) => (
          <Card key={label} className="transition-colors hover:border-primary/40">
            <Link to={to} className="block">
              <CardContent className="flex items-center justify-between py-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-md bg-secondary p-2.5">
                    <Icon className="size-5 text-evidence" aria-hidden />
                  </div>
                  <div>
                    <div className="font-display text-2xl font-semibold">
                      {isPending ? <Skeleton className="h-7 w-10" /> : value}
                    </div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  </div>
                </div>
                <ArrowRight
                  className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Master Resume</CardTitle>
            <CardDescription>
              Your canonical career record, stored as atomic evidence.
            </CardDescription>
          </div>
          <Badge variant={data?.master ? "default" : "secondary"}>
            {isPending
              ? "Checking…"
              : data?.master
                ? (data.master.status ?? "draft")
                : "Not set up"}
          </Badge>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : data?.master ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">{data.master.title}</p>
                <p className="text-xs text-muted-foreground">
                  {data.evidenceCount} evidence record{data.evidenceCount === 1 ? "" : "s"} · last
                  updated {new Date(data.master.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/master-resume">Open Master Resume</Link>
                </Button>
                {data.evidenceCount > 0 && (
                  <Button asChild size="sm">
                    <Link to="/jobs">
                      <Sparkles className="size-3.5 mr-1.5" aria-hidden />
                      Tailor for Job
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
              <FileStack className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-4 font-display text-lg font-semibold">No Master Resume yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Import an existing resume PDF or start from scratch. Everything you add becomes
                evidence — experience, projects, education, skills and measurable outcomes — that
                future tailoring must cite.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link to="/master-resume">
                    <Plus className="size-4 mr-1.5" aria-hidden />
                    Create Master Resume
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/import">
                    <FileUp className="size-4 mr-1.5" aria-hidden />
                    Import PDF
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent tailoring</CardTitle>
            <CardDescription>
              Tailored resumes generated against specific job postings.
            </CardDescription>
          </div>
          {data && data.tailored.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/jobs">
                View all jobs
                <ArrowRight className="size-3.5 ml-1" aria-hidden />
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : data && data.tailored.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.tailored.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {item.job_id ? (
                        <Link
                          to="/jobs/$jobId/tailored"
                          params={{ jobId: item.job_id }}
                          className="text-sm font-medium hover:underline hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          {item.title}
                          <ExternalLink
                            className="size-3 text-muted-foreground opacity-60"
                            aria-hidden
                          />
                        </Link>
                      ) : (
                        <p className="text-sm font-medium">{item.title}</p>
                      )}
                      {item.version != null && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          v{item.version}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {item.match_score != null
                        ? ` · ${Math.round(item.match_score * 100)}% match`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === "validated" ? "default" : "secondary"}>
                      {item.status}
                    </Badge>
                    {item.job_id && (
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
                          <Link to="/jobs/$jobId/preview" params={{ jobId: item.job_id }}>
                            Preview
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs">
                          <Link to="/jobs/$jobId/tailored" params={{ jobId: item.job_id }}>
                            Edit
                            <ArrowRight className="size-3.5 ml-1" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <History className="mx-auto size-7 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">No tailoring runs yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Paste a target job posting to analyze its requirements and generate an ATS-friendly
                tailored resume where every statement cites your verified Master Resume evidence.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Button asChild>
                  <Link to="/jobs">
                    <Sparkles className="size-4 mr-1.5" aria-hidden />
                    Tailor for a Job
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
