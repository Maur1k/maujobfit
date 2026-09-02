import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Layers, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { classifyMasterSkills } from "@/lib/skill-relevance.functions";
import {
  groupSkillRelevance,
  MASTER_IMMUTABILITY_NOTE,
  SKILL_RELEVANCE,
  skillRelevanceBadgeClass,
  skillRelevanceBlurb,
  skillRelevanceLabel,
  type JobSkillRelevanceRow,
} from "@/lib/skill-relevance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function skillRelevanceQueryKey(jobId: string, userId?: string) {
  return ["job-skill-relevance", jobId, userId];
}

export function SkillRelevancePanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const queryKey = skillRelevanceQueryKey(jobId, user?.id);

  const relevanceQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_skill_relevance")
        .select(
          "id, job_id, master_resume_id, skill_name, canonical_skill, relevance, rationale, matched_requirement_ids, resume_evidence_ids, resume_item_ids, created_at",
        )
        .eq("job_id", jobId)
        .order("skill_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as JobSkillRelevanceRow[];
    },
    enabled: !!user,
  });

  const run = async () => {
    setRunning(true);
    try {
      const result = await classifyMasterSkills({ data: { jobId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        `Classified ${result.total} master resume skills — ${result.exact} matched, ${result.related} supporting, ${result.listedOnly} listed only, ${result.notRelevant} not relevant.`,
      );
    } catch {
      toast.error("The skill relevance run failed. Please retry.");
    } finally {
      setRunning(false);
    }
  };

  const rows = relevanceQuery.data ?? [];
  const groups = groupSkillRelevance(rows);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4 text-muted-foreground" aria-hidden />
              Skill relevance for this job
            </CardTitle>
            <CardDescription>
              Every skill already in your master resume, classified for this posting only. {MASTER_IMMUTABILITY_NOTE}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={running} onClick={() => void run()}>
            {running ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="size-4" aria-hidden />
            )}
            {rows.length > 0 ? "Re-classify skills" : "Classify skills"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {relevanceQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : relevanceQuery.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            We couldn't load the skill relevance layer.
            <Button variant="outline" size="sm" className="ml-3" onClick={() => void relevanceQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
            No relevance classification yet. Run it to see which master resume skills this job matches — nothing in
            your master resume is changed by the run.
          </div>
        ) : (
          <>
            {SKILL_RELEVANCE.map((relevance) => {
              const group = groups[relevance];
              if (group.length === 0) return null;
              return (
                <section key={relevance} className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={skillRelevanceBadgeClass[relevance]}>{skillRelevanceLabel[relevance]}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{group.length}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{skillRelevanceBlurb[relevance]}</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {group.map((row) => (
                      <li key={row.id}>
                        <span
                          className="inline-flex items-center gap-2 rounded-md border bg-secondary/40 px-2.5 py-1 text-sm"
                          title={row.rationale}
                        >
                          {row.skill_name}
                          {row.resume_evidence_ids.length > 0 ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {row.resume_evidence_ids.length} evidence
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            <p className="flex items-start gap-2 rounded-lg border border-[hsl(var(--evidence))]/40 bg-[hsl(var(--evidence))]/5 p-3 text-xs">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[hsl(var(--evidence))]" aria-hidden />
              <span>
                All {rows.length} skills above remain stored in your Master Resume. Tailoring only selects and
                reorders which of them appear in a tailored version for this job.
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
