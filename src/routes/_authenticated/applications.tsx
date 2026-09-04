import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Briefcase, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  APPLICATION_COLUMNS,
  APPLICATION_STATUSES,
  applicationChannelLabel,
  applicationStatusBadgeClass,
  applicationStatusLabel,
  formatAppliedAt,
  type ApplicationRow,
} from "@/lib/applications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({
    meta: [
      { title: "Applications Tracker — MauJobFit" },
      {
        name: "description",
        content:
          "Track every job application: which tailored resume version you sent, to whom, through which channel, on what date, and where it stands now.",
      },
      { property: "og:title", content: "Applications Tracker — MauJobFit" },
      {
        property: "og:description",
        content:
          "A dated log of the tailored resume versions you sent, linked back to each job's match report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["applications", user?.id];
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select(APPLICATION_COLUMNS)
        .order("applied_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ApplicationRow[];
    },
    enabled: !!user,
  });

  const rows = dataQuery.data ?? [];
  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter)),
    [rows, statusFilter],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const updateStatus = async (row: ApplicationRow, status: string) => {
    const { error } = await supabase.from("job_applications").update({ status }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
    toast.success(`Marked as ${applicationStatusLabel[status] ?? status}.`);
  };

  const remove = async (row: ApplicationRow) => {
    const { error } = await supabase.from("job_applications").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
    toast.success("Application entry removed.");
  };

  if (dataQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (dataQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden />
        <p className="mt-3 text-sm">We couldn't load your applications.</p>
        <Button variant="outline" className="mt-4" onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Applications</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A dated log of which tailored resume version you sent where. Entries reference the
            resume version and cover letter you used — they never alter them.
          </p>
        </div>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses ({rows.length})</SelectItem>
              {APPLICATION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {applicationStatusLabel[value]} ({counts.get(value) ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No applications logged yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Open a job, generate the tailored resume and cover letter, then log the submission
              from its application page.
            </p>
            <Button asChild variant="outline">
              <Link to="/jobs">
                <Briefcase className="size-4" aria-hidden />
                Go to jobs
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">Logged job applications with dates and versions</caption>
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Version sent
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Where
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatAppliedAt(row.applied_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.job_title}</div>
                    {row.company ? (
                      <div className="text-xs text-muted-foreground">{row.company}</div>
                    ) : null}
                    {row.notes ? (
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{row.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>Resume v{row.tailored_resume_version ?? "?"}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.cover_letter_id ? "With cover letter" : "Resume only"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{applicationChannelLabel[row.channel] ?? row.channel}</div>
                    {row.sent_to ? (
                      <div className="text-xs text-muted-foreground">{row.sent_to}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={applicationStatusBadgeClass[row.status]}>
                      {applicationStatusLabel[row.status] ?? row.status}
                    </Badge>
                    <div className="mt-2 w-36">
                      <Select
                        value={row.status}
                        onValueChange={(value) => void updateStatus(row, value)}
                      >
                        <SelectTrigger
                          className="h-8 text-xs"
                          aria-label={`Update status for ${row.job_title}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPLICATION_STATUSES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {applicationStatusLabel[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-2">
                      {row.job_id ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/jobs/$jobId/match" params={{ jobId: row.job_id }}>
                            Match report
                          </Link>
                        </Button>
                      ) : null}
                      {row.job_id ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/jobs/$jobId/apply" params={{ jobId: row.job_id }}>
                            Application page
                          </Link>
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => void remove(row)}>
                        <Trash2 className="size-4" aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
