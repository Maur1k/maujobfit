import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, FileDown, Loader2, Mail, RefreshCcw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateCoverLetter, saveCoverLetter } from "@/lib/cover-letter.functions";
import { coverLetterBody, coverLetterStatusLabel, type CoverLetterRow } from "@/lib/cover-letter";
import { buildCoverLetterPdf } from "@/lib/cover-letter-pdf";
import { validationStatusLabel } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/cover-letter")({
  head: () => ({
    meta: [
      { title: "Evidence-Backed Cover Letter — MauJobFit" },
      {
        name: "description",
        content:
          "Draft a concise cover letter from your supported resume claims only, review and edit it, revalidate against stored evidence, then export a clean application-ready PDF.",
      },
      { property: "og:title", content: "Evidence-Backed Cover Letter — MauJobFit" },
      {
        property: "og:description",
        content: "A cover letter with no invented claims: every sentence traces back to your own stored evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoverLetterPage,
});

const statusStyles: Record<string, string> = {
  supported: "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/10",
  partially_supported: "border-amber-500/50 bg-amber-500/10",
  needs_review: "border-amber-500/50 bg-amber-500/10",
  unsupported: "border-destructive/40 bg-destructive/5",
  pending: "border-border bg-secondary/40",
};

function CoverLetterPage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["cover-letter", jobId, user?.id];

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{
    recipient: string;
    greeting: string;
    opening: string;
    paragraphs: { id: string; text: string }[];
    closing: string;
    signoff: string;
  } | null>(null);

  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const job = await supabase.from("jobs").select("id, title, company").eq("id", jobId).maybeSingle();
      if (job.error) throw new Error(job.error.message);

      const resumes = await supabase
        .from("tailored_resumes")
        .select("id, version")
        .eq("job_id", jobId)
        .order("version", { ascending: false })
        .limit(1);
      if (resumes.error) throw new Error(resumes.error.message);
      const resume = resumes.data?.[0] ?? null;

      const profile = await supabase
        .from("profiles")
        .select("full_name, headline, email, phone, location, portfolio_url, github_url, linkedin_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (profile.error) throw new Error(profile.error.message);

      if (!resume) {
        return { job: job.data, resume: null, letter: null as CoverLetterRow | null, supportedCount: 0, profile: profile.data };
      }

      const [letters, items] = await Promise.all([
        supabase
          .from("cover_letters")
          .select("*")
          .eq("tailored_resume_id", resume.id)
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase.from("tailored_resume_items").select("id, validation_status").eq("tailored_resume_id", resume.id),
      ]);
      if (letters.error) throw new Error(letters.error.message);
      if (items.error) throw new Error(items.error.message);

      return {
        job: job.data,
        resume,
        letter: (letters.data?.[0] ?? null) as CoverLetterRow | null,
        supportedCount: (items.data ?? []).filter((row) => row.validation_status === "supported").length,
        profile: profile.data,
      };
    },
    enabled: !!user,
  });

  const letter = dataQuery.data?.letter ?? null;

  useEffect(() => {
    if (!letter) {
      setDraft(null);
      return;
    }
    setDraft({
      recipient: letter.recipient ?? "",
      greeting: letter.greeting,
      opening: letter.opening,
      paragraphs: (letter.paragraphs ?? []).map((row) => ({ id: row.id, text: row.text })),
      closing: letter.closing,
      signoff: letter.signoff,
    });
  }, [letter?.id, letter?.updated_at]);

  const generate = async () => {
    const resumeId = dataQuery.data?.resume?.id;
    if (!resumeId) return;
    setGenerating(true);
    try {
      const result = await generateCoverLetter({ data: { tailoredResumeId: resumeId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(`Drafted ${result.paragraphCount} evidence-backed paragraph${result.paragraphCount === 1 ? "" : "s"}.`);
    } catch {
      toast.error("The cover-letter draft failed. Please retry.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!letter || !draft) return;
    setSaving(true);
    try {
      const result = await saveCoverLetter({
        data: {
          coverLetterId: letter.id,
          greeting: draft.greeting,
          opening: draft.opening,
          paragraphs: draft.paragraphs,
          closing: draft.closing,
          signoff: draft.signoff,
          recipient: draft.recipient || null,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        result.flagged === 0
          ? "Saved — every paragraph still traces back to its stored evidence."
          : `Saved, but ${result.flagged} paragraph${result.flagged === 1 ? "" : "s"} need attention before you send this.`,
      );
    } catch {
      toast.error("Saving the cover letter failed. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    if (!letter || !dataQuery.data) return;
    const { job, profile, resume } = dataQuery.data;
    const body = coverLetterBody({
      opening: draft?.opening ?? letter.opening,
      paragraphs: (draft?.paragraphs ?? letter.paragraphs).map((row) => ({ text: row.text })),
      closing: draft?.closing ?? letter.closing,
    });
    if (body.length === 0) {
      toast.error("There is no letter content to export yet.");
      return;
    }
    const { blob, fileName } = buildCoverLetterPdf({
      profile: profile ?? null,
      jobTitle: job?.title ?? null,
      jobCompany: job?.company ?? null,
      recipient: draft?.recipient || letter.recipient || null,
      greeting: draft?.greeting ?? letter.greeting,
      body,
      signoff: draft?.signoff ?? letter.signoff,
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    const { error } = await supabase.from("exports").insert({
      user_id: user!.id,
      tailored_resume_id: resume?.id ?? null,
      format: "pdf",
      file_name: fileName,
      status: "downloaded_cover_letter",
    });
    if (error) toast.error(`Downloaded, but we couldn't record the export: ${error.message}`);
    else {
      await supabase.from("cover_letters").update({ status: "exported" }).eq("id", letter.id);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Cover letter downloaded.");
    }
  };

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
        <p className="mt-3 text-sm">We couldn't load the cover letter for this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, resume, supportedCount } = dataQuery.data;
  const flagged = (letter?.paragraphs ?? []).filter((row) => row.status !== "supported");

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
            <h1 className="text-3xl font-semibold">Cover letter</h1>
            <p className="text-sm text-muted-foreground">
              {[job.title, job.company].filter(Boolean).join(" · ")} — written only from claims validated as supported and
              the evidence behind them. No invented metrics, employers, projects or enthusiasm.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={letter ? "outline" : "default"} disabled={generating || !resume || supportedCount === 0} onClick={() => void generate()}>
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden />
                  {letter ? "Draft again" : "Draft cover letter"}
                </>
              )}
            </Button>
            {letter ? (
              <Button onClick={() => void exportPdf()}>
                <FileDown className="size-4" aria-hidden />
                Download PDF
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {!resume ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <Mail className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No tailored resume yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Generate and validate a tailored resume for this job first — the letter draws only on its supported claims.
          </p>
        </div>
      ) : supportedCount === 0 ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-8 text-center">
          <AlertTriangle className="mx-auto size-6 text-amber-600" aria-hidden />
          <p className="mt-3 font-medium">No defensible claim to write from</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Nothing in this resume is validated as supported yet, so there is nothing a cover letter could honestly assert.
            Resolve the flagged claims first.
          </p>
        </div>
      ) : !letter || !draft ? (
        <div className="rounded-lg border border-dashed bg-secondary/30 p-10 text-center">
          <Mail className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No cover letter drafted yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Draft one from your {supportedCount} supported claim{supportedCount === 1 ? "" : "s"}. You can edit every line
            before exporting, and each edit is rechecked against the same stored evidence.
          </p>
        </div>
      ) : (
        <>
          <Card className={flagged.length ? "border-amber-500/50 bg-amber-500/5" : "border-[hsl(var(--evidence))]/40 bg-[hsl(var(--evidence))]/5"}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {flagged.length === 0
                      ? "Every paragraph traces back to your stored evidence"
                      : `${flagged.length} paragraph${flagged.length === 1 ? "" : "s"} need attention`}
                  </CardTitle>
                  <CardDescription>
                    Overall: {validationStatusLabel[letter.validation_status] ?? letter.validation_status} ·{" "}
                    {coverLetterStatusLabel[letter.status] ?? letter.status} · last updated{" "}
                    {new Date(letter.updated_at).toLocaleString()}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={statusStyles[letter.validation_status] ?? statusStyles["pending"]}>
                  {validationStatusLabel[letter.validation_status] ?? letter.validation_status}
                </Badge>
              </div>
            </CardHeader>
            {letter.notes ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">{letter.notes}</p>
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review and edit</CardTitle>
              <CardDescription>
                Edits are rechecked against the evidence already linked to each paragraph — no new evidence is attached and
                nothing is substituted. The exported PDF carries none of this review material.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="recipient">Addressed to</Label>
                  <Input
                    id="recipient"
                    value={draft.recipient}
                    onChange={(event) => setDraft({ ...draft, recipient: event.target.value })}
                    placeholder="Hiring team, company name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="greeting">Greeting</Label>
                  <Input
                    id="greeting"
                    value={draft.greeting}
                    onChange={(event) => setDraft({ ...draft, greeting: event.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="opening">Opening</Label>
                <Textarea
                  id="opening"
                  rows={4}
                  value={draft.opening}
                  onChange={(event) => setDraft({ ...draft, opening: event.target.value })}
                />
              </div>

              {draft.paragraphs.map((paragraph, index) => {
                const stored = letter.paragraphs.find((row) => row.id === paragraph.id);
                return (
                  <div key={paragraph.id} className="space-y-1.5 rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`paragraph-${paragraph.id}`}>Body paragraph {index + 1}</Label>
                      {stored ? (
                        <Badge variant="outline" className={statusStyles[stored.status] ?? statusStyles["pending"]}>
                          {validationStatusLabel[stored.status] ?? stored.status}
                        </Badge>
                      ) : null}
                    </div>
                    <Textarea
                      id={`paragraph-${paragraph.id}`}
                      rows={5}
                      value={paragraph.text}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          paragraphs: draft.paragraphs.map((row) =>
                            row.id === paragraph.id ? { ...row, text: event.target.value } : row,
                          ),
                        })
                      }
                    />
                    {stored ? (
                      <p className="text-xs text-muted-foreground">
                        {stored.rationale}
                        {stored.evidence_ids.length
                          ? ` · ${stored.evidence_ids.length} stored evidence record${stored.evidence_ids.length === 1 ? "" : "s"} linked`
                          : ""}
                      </p>
                    ) : null}
                    {stored?.unsupported_spans.length ? (
                      <p className="text-xs text-destructive">
                        Not substantiated: {stored.unsupported_spans.join(", ")}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <div className="space-y-1.5">
                <Label htmlFor="closing">Closing</Label>
                <Textarea
                  id="closing"
                  rows={3}
                  value={draft.closing}
                  onChange={(event) => setDraft({ ...draft, closing: event.target.value })}
                />
              </div>

              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="signoff">Sign-off</Label>
                <Input
                  id="signoff"
                  value={draft.signoff}
                  onChange={(event) => setDraft({ ...draft, signoff: event.target.value })}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Saving and revalidating…
                    </>
                  ) : (
                    <>
                      <Save className="size-4" aria-hidden />
                      Save and revalidate
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Saving reruns the evidence check on every paragraph you changed.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
