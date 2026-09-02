import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileUp, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EvidencePrinciple } from "@/components/EvidencePrinciple";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/master-resume")({
  head: () => ({
    meta: [
      { title: "Master Resume — Evidence Tailor" },
      {
        name: "description",
        content:
          "Your canonical career record stored as atomic evidence: experience, projects, education, skills and measurable outcomes.",
      },
      { property: "og:title", content: "Master Resume — Evidence Tailor" },
      {
        property: "og:description",
        content: "One canonical record of your career, stored as atomic evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MasterResumePage,
});

const categories = [
  { key: "experience", label: "Experience", hint: "Roles, employers, dates and what you owned." },
  { key: "project", label: "Projects", hint: "Shipped work, the stack used and your contribution." },
  { key: "achievement", label: "Achievements", hint: "Measurable outcomes: latency, users, savings." },
  { key: "skill", label: "Skills", hint: "Languages, frameworks, databases, tooling." },
  { key: "education", label: "Education", hint: "Degrees, majors, institutions and dates." },
  { key: "certification", label: "Certifications", hint: "Credentials with issuer and date." },
] as const;

function MasterResumePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["master-resume", user?.id],
    queryFn: async () => {
      const { data: master } = await supabase
        .from("master_resumes")
        .select("id, title, summary, status, updated_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!master) return { master: null, evidence: [] };

      const { data: evidence } = await supabase
        .from("resume_evidence")
        .select("id, category, title, organization, content, verified")
        .eq("master_resume_id", master.id)
        .order("sort_order", { ascending: true });

      return { master, evidence: evidence ?? [] };
    },
    enabled: !!user,
  });

  const createMaster = async () => {
    if (!user) return;
    setCreating(true);
    const { error } = await supabase
      .from("master_resumes")
      .insert({ user_id: user.id, title: "Master Resume", status: "draft" });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("Master Resume created. Evidence capture arrives next.");
    queryClient.invalidateQueries({ queryKey: ["master-resume", user.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", user.id] });
  };

  const notYet = () =>
    toast.info("PDF import lands in the next phase — parsing will create evidence records for you.");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Master Resume</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The single source of truth for your career. Everything here is stored as an atomic
            evidence record so tailored resumes can cite it precisely.
          </p>
        </div>
        {data?.master ? (
          <Badge variant="secondary">{data.master.status}</Badge>
        ) : null}
      </div>

      <EvidencePrinciple />

      {isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : data?.master ? (
        <Card>
          <CardHeader>
            <CardTitle>{data.master.title}</CardTitle>
            <CardDescription>
              {data.evidence.length} evidence record{data.evidence.length === 1 ? "" : "s"} · last
              updated {new Date(data.master.updated_at).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.evidence.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
                <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
                <p className="mt-4 font-display text-lg font-semibold">No evidence captured yet</p>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                  Your resume shell exists, but there is nothing to cite yet. Import a PDF or add
                  records manually — each one becomes a citable unit with its own source reference.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button onClick={notYet}>
                    <FileUp className="size-4" aria-hidden />
                    Import PDF
                  </Button>
                  <Button variant="outline" onClick={notYet}>
                    <Plus className="size-4" aria-hidden />
                    Add evidence manually
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.evidence.map((record) => (
                  <li key={record.id} className="space-y-1 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{record.category}</Badge>
                      <p className="text-sm font-medium">{record.title ?? "Untitled"}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{record.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileUp className="mx-auto size-9 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold">Set up your Master Resume</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Start with the resume you already have, or build it record by record. Nothing is
              generated for you — the library only ever holds facts you supplied.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={createMaster} disabled={creating}>
                {creating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                Create Master Resume
              </Button>
              <Button variant="outline" onClick={notYet}>
                <FileUp className="size-4" aria-hidden />
                Import PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold">Evidence categories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How your history will be broken down once capture is enabled.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <div key={category.key} className="rounded-lg border border-border bg-card p-4">
              <p className="font-medium">{category.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{category.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
