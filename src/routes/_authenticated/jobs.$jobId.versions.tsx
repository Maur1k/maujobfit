import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, History, RefreshCcw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { diffSnapshots, diffSummary, snapshotReasonLabel, wordDiff, type ResumeVersionRow } from "@/lib/versions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/versions")({
  head: () => ({
    meta: [
      { title: "Resume Version History — MauJobFit" },
      {
        name: "description",
        content:
          "Append-only snapshots of your tailored resume with a word-level diff between any two versions, including edits, accepted rewrites and exports.",
      },
      { property: "og:title", content: "Resume Version History — MauJobFit" },
      {
        property: "og:description",
        content: "Compare any two tailored-resume snapshots line by line, with timestamps and export associations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VersionsPage,
});

const changeStyles: Record<string, string> = {
  added: "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/10",
  removed: "border-destructive/40 bg-destructive/5",
  changed: "border-amber-500/50 bg-amber-500/10",
  unchanged: "border-border bg-secondary/30",
};

function VersionsPage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const dataQuery = useQuery({
    queryKey: ["resume-versions", jobId, user?.id],
    queryFn: async () => {
      const job = await supabase.from("jobs").select("id, title, company").eq("id", jobId).maybeSingle();
      if (job.error) throw new Error(job.error.message);

      const versions = await supabase
        .from("tailored_resume_versions")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (versions.error) throw new Error(versions.error.message);

      const rows = (versions.data ?? []) as unknown as ResumeVersionRow[];
      const exportIds = [...new Set(rows.map((row) => row.export_id).filter(Boolean))] as string[];
      const exports = exportIds.length
        ? await supabase.from("exports").select("id, file_name, format, status").in("id", exportIds)
        : { data: [], error: null };
      if (exports.error) throw new Error(exports.error.message);

      return {
        job: job.data,
        rows,
        exports: new Map((exports.data ?? []).map((row) => [row.id, row])),
      };
    },
    enabled: !!user,
  });

  const rows = dataQuery.data?.rows ?? [];
  const right = rows.find((row) => row.id === rightId) ?? rows[0] ?? null;
  const left = rows.find((row) => row.id === leftId) ?? rows[1] ?? null;

  const diff = useMemo(() => {
    if (!left || !right) return [];
    return diffSnapshots(left.items ?? [], right.items ?? []);
  }, [left, right]);
  const summary = useMemo(() => diffSummary(diff), [diff]);

  if (dataQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (dataQuery.isError || !dataQuery.data?.job) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load the version history for this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, exports } = dataQuery.data;

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
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">Version history</h1>
          <p className="text-sm text-muted-foreground">
            {[job.title, job.company].filter(Boolean).join(" · ")} — every snapshot is append-only. Generation, item edits,
            accepted rewrites, composition state and exports each record their own entry; nothing is ever overwritten.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <History className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No snapshots yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generate a tailored resume, then edit, accept a rewrite or export it — each of those records a version here.
          </p>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Snapshots ({rows.length})</CardTitle>
              <CardDescription>Newest first. Select two to compare below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row) => {
                const exportRow = row.export_id ? exports.get(row.export_id) : null;
                const isLeft = left?.id === row.id;
                const isRight = right?.id === row.id;
                return (
                  <div
                    key={row.id}
                    className={`rounded-md border p-3 ${isRight ? "border-primary/60 bg-primary/5" : isLeft ? "border-amber-500/50 bg-amber-500/5" : "bg-background"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{row.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()} · {row.item_count} item
                          {row.item_count === 1 ? "" : "s"} · {row.supported_count} supported
                          {row.supported_only ? " · supported-only composition" : ""}
                        </p>
                        {row.notes ? <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p> : null}
                        {exportRow ? (
                          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Download className="size-3" aria-hidden />
                            {exportRow.file_name} ({exportRow.format})
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{snapshotReasonLabel[row.reason] ?? row.reason}</Badge>
                        <Badge variant="outline">v{row.version}</Badge>
                        {isRight ? <Badge>After</Badge> : null}
                        {isLeft ? <Badge variant="outline">Before</Badge> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compare versions</CardTitle>
              <CardDescription>
                Added, removed and changed items with the exact text before and after, plus any validation-status change.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Before</p>
                  <Select value={left?.id ?? ""} onValueChange={setLeftId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a snapshot" />
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.label} — {new Date(row.created_at).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">After</p>
                  <Select value={right?.id ?? ""} onValueChange={setRightId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a snapshot" />
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.label} — {new Date(row.created_at).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!left || !right || left.id === right.id ? (
                <p className="rounded-md border border-dashed bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
                  Pick two different snapshots to see the diff.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className={changeStyles["added"]}>
                      {summary["added"]} added
                    </Badge>
                    <Badge variant="outline" className={changeStyles["removed"]}>
                      {summary["removed"]} removed
                    </Badge>
                    <Badge variant="outline" className={changeStyles["changed"]}>
                      {summary["changed"]} changed
                    </Badge>
                    <Badge variant="outline" className={changeStyles["unchanged"]}>
                      {summary["unchanged"]} unchanged
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setShowUnchanged((value) => !value)}>
                      {showUnchanged ? "Hide unchanged" : "Show unchanged"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {diff
                      .filter((entry) => showUnchanged || entry.change !== "unchanged")
                      .map((entry) => {
                        const inline =
                          entry.change === "changed" ? wordDiff(entry.before ?? "", entry.after ?? "") : null;
                        return (
                          <div key={`${entry.key}-${entry.change}`} className={`rounded-md border p-3 ${changeStyles[entry.change]}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{entry.change}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {entry.section}
                                {entry.heading ? ` · ${entry.heading}` : ""}
                              </span>
                              {entry.statusBefore !== entry.statusAfter ? (
                                <span className="text-xs text-muted-foreground">
                                  status {entry.statusBefore ?? "—"} → {entry.statusAfter ?? "—"}
                                </span>
                              ) : null}
                              {entry.evidenceChanged ? (
                                <span className="text-xs text-muted-foreground">evidence links changed</span>
                              ) : null}
                            </div>
                            {inline ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <p className="text-sm">
                                  {inline.before.map((token, index) => (
                                    <span key={index} className={token.removed ? "bg-destructive/15 line-through" : ""}>
                                      {token.token}
                                    </span>
                                  ))}
                                </p>
                                <p className="text-sm">
                                  {inline.after.map((token, index) => (
                                    <span key={index} className={token.added ? "bg-[hsl(var(--evidence))]/20" : ""}>
                                      {token.token}
                                    </span>
                                  ))}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-2 text-sm">{entry.after ?? entry.before}</p>
                            )}
                          </div>
                        );
                      })}
                    {diff.filter((entry) => showUnchanged || entry.change !== "unchanged").length === 0 ? (
                      <p className="rounded-md border border-dashed bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
                        These two snapshots have identical content.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
