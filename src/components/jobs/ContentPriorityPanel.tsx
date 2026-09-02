import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListOrdered, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { prioritiseJobContent } from "@/lib/composition.functions";
import {
  COMPOSITION_PRIORITIES,
  groupPriorities,
  priorityBadgeClass,
  priorityBlurb,
  priorityLabel,
  type JobContentPriorityRow,
} from "@/lib/composition";
import { tailoredSectionLabel } from "@/lib/tailoring";
import { MASTER_IMMUTABILITY_NOTE } from "@/lib/skill-relevance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function contentPriorityQueryKey(jobId: string, userId?: string) {
  return ["job-content-priorities", jobId, userId];
}

export function ContentPriorityPanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const queryKey = contentPriorityQueryKey(jobId, user?.id);

  const priorityQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_content_priorities")
        .select(
          "id, job_id, master_resume_id, resume_item_id, resume_evidence_id, section, label, priority, score, rationale, matched_terms, created_at",
        )
        .eq("job_id", jobId)
        .order("score", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as JobContentPriorityRow[];
    },
    enabled: !!user,
  });

  const run = async () => {
    setRunning(true);
    try {
      const result = await prioritiseJobContent({ data: { jobId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        `Ranked ${result.total} master resume entries — ${result.high} high, ${result.supporting} supporting, ${result.low} low, ${result.excluded} left out of this version.`,
      );
    } catch {
      toast.error("The relevance ranking failed. Please retry.");
    } finally {
      setRunning(false);
    }
  };

  const rows = priorityQuery.data ?? [];
  const groups = groupPriorities(rows);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="size-4 text-muted-foreground" aria-hidden />
              Selection priorities for this job
            </CardTitle>
            <CardDescription>
              Every entry in your Master Resume is ranked for this posting instead of being filtered out. Exclusion is
              rare and always explained. {MASTER_IMMUTABILITY_NOTE}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={running} onClick={() => void run()}>
            {running ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="size-4" aria-hidden />
            )}
            {rows.length > 0 ? "Re-rank content" : "Rank content"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {priorityQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : priorityQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            We couldn't load the selection priorities.
            <Button variant="outline" size="sm" className="ml-3" onClick={() => void priorityQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
            Nothing ranked yet. Ranking reads your Master Resume and this job's requirements — it never changes either.
          </div>
        ) : (
          COMPOSITION_PRIORITIES.map((priority) => {
            const group = groups[priority];
            if (group.length === 0) return null;
            return (
              <section key={priority} className="rounded-lg border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={priorityBadgeClass[priority]}>{priorityLabel[priority]}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{group.length}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{priorityBlurb[priority]}</p>
                <ul className="mt-3 space-y-2">
                  {group.slice(0, 40).map((row) => (
                    <li key={row.id} className="rounded-md border bg-secondary/30 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{row.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {tailoredSectionLabel[row.section] ?? row.section}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">score {row.score}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{row.rationale}</p>
                    </li>
                  ))}
                </ul>
                {group.length > 40 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing the 40 highest-scoring of {group.length}.
                  </p>
                ) : null}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
