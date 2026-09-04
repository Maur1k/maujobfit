import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileDown,
  Loader2,
  Mail,
  Package,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { generateTailoredResume } from "@/lib/tailoring.functions";
import { validateTailoredResume } from "@/lib/validation.functions";
import { generateCoverLetter } from "@/lib/cover-letter.functions";
import { snapshotTailoredResume } from "@/lib/versions.functions";
import { buildProfessionalResumePdf, type ProEvidence } from "@/lib/resume-pdf-professional";
import { buildCoverLetterPdf } from "@/lib/cover-letter-pdf";
import { coverLetterBody, type CoverLetterRow } from "@/lib/cover-letter";
import { normaliseSettings, settingsSummary } from "@/lib/tailoring-settings";
import {
  TAILORED_ITEM_COLUMNS,
  TAILORED_RESUME_COLUMNS,
  type TailoredItemRow,
  type TailoredResumeRow,
  type TailoredSourceRow,
} from "@/lib/tailoring";
import {
  APPLICATION_CHANNELS,
  APPLICATION_COLUMNS,
  APPLICATION_STATUSES,
  applicationChannelLabel,
  applicationStatusBadgeClass,
  applicationStatusLabel,
  formatAppliedAt,
  toDateInputValue,
  type ApplicationRow,
} from "@/lib/applications";
import { downloadBlob, mergePdfBlobs, slugifyForFile } from "@/lib/application-package";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/jobs/$jobId/apply")({
  head: () => ({
    meta: [
      { title: "Job Application Package — MauJobFit" },
      {
        name: "description",
        content:
          "Generate the tailored resume and evidence-backed cover letter for one job, download them as a single application PDF, and log where and when you sent it.",
      },
      { property: "og:title", content: "Job Application Package — MauJobFit" },
      {
        property: "og:description",
        content:
          "One screen per job: tailored resume, cover letter, a single combined PDF package, and an application log entry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplyPage,
});

type EvidenceLite = ProEvidence & { content: string };

function ApplyPage() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["job-application", jobId, user?.id];

  const [busy, setBusy] = useState<"resume" | "letter" | "package" | "log" | null>(null);
  const [supportedOnly, setSupportedOnly] = useState(true);
  const [form, setForm] = useState({
    sent_to: "",
    channel: "email",
    status: "sent",
    applied_at: toDateInputValue(new Date()),
    notes: "",
  });

  const dataQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const job = await supabase
        .from("jobs")
        .select("id, title, company, analysis_status")
        .eq("id", jobId)
        .maybeSingle();
      if (job.error) throw new Error(job.error.message);

      const [profile, resumes, applications, matches] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "full_name, headline, email, phone, location, portfolio_url, github_url, linkedin_url",
          )
          .eq("id", user!.id)
          .maybeSingle(),
        supabase
          .from("tailored_resumes")
          .select(TAILORED_RESUME_COLUMNS)
          .eq("job_id", jobId)
          .order("version", { ascending: false })
          .limit(1),
        supabase
          .from("job_applications")
          .select(APPLICATION_COLUMNS)
          .eq("job_id", jobId)
          .order("applied_at", { ascending: false }),
        supabase.from("match_results").select("id").eq("job_id", jobId).limit(1),
      ]);
      if (profile.error) throw new Error(profile.error.message);
      if (resumes.error) throw new Error(resumes.error.message);
      if (applications.error) throw new Error(applications.error.message);
      if (matches.error) throw new Error(matches.error.message);

      const resume = (resumes.data?.[0] ?? null) as TailoredResumeRow | null;
      const base = {
        job: job.data,
        profile: profile.data,
        resume,
        hasMatchReport: (matches.data ?? []).length > 0,
        applications: (applications.data ?? []) as ApplicationRow[],
        items: [] as TailoredItemRow[],
        sources: [] as TailoredSourceRow[],
        evidence: new Map<string, EvidenceLite>(),
        letter: null as CoverLetterRow | null,
      };
      if (!resume) return base;

      const [items, sources, letters] = await Promise.all([
        supabase
          .from("tailored_resume_items")
          .select(TAILORED_ITEM_COLUMNS)
          .eq("tailored_resume_id", resume.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tailored_resume_item_sources")
          .select(
            "id, tailored_resume_item_id, resume_evidence_id, support_type, confidence, excerpt",
          )
          .eq("user_id", user!.id),
        supabase
          .from("cover_letters")
          .select("*")
          .eq("tailored_resume_id", resume.id)
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);
      if (items.error) throw new Error(items.error.message);
      if (sources.error) throw new Error(sources.error.message);
      if (letters.error) throw new Error(letters.error.message);

      const itemIds = new Set((items.data ?? []).map((row) => row.id));
      const scopedSources = ((sources.data ?? []) as TailoredSourceRow[]).filter((row) =>
        itemIds.has(row.tailored_resume_item_id),
      );
      const evidenceIds = [...new Set(scopedSources.map((row) => row.resume_evidence_id))];
      const evidence = evidenceIds.length
        ? await supabase
            .from("resume_evidence")
            .select(
              "id, category, title, organization, role, start_date, end_date, content, skills",
            )
            .in("id", evidenceIds)
        : { data: [] as EvidenceLite[], error: null };
      if (evidence.error) throw new Error(evidence.error.message);

      return {
        ...base,
        items: (items.data ?? []) as TailoredItemRow[],
        sources: scopedSources,
        evidence: new Map(((evidence.data ?? []) as EvidenceLite[]).map((row) => [row.id, row])),
        letter: (letters.data?.[0] ?? null) as CoverLetterRow | null,
      };
    },
    enabled: !!user,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const generateResume = async () => {
    setBusy("resume");
    try {
      const result = await generateTailoredResume({ data: { jobId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.tailoredResumeId) {
        await snapshotTailoredResume({
          data: {
            tailoredResumeId: result.tailoredResumeId,
            reason: "generated",
            label: `v${result.version} · generated for application`,
            notes: `${result.itemCount} items with ${result.sourceCount} citations.`,
          },
        }).catch(() => null);
        await validateTailoredResume({ data: { tailoredResumeId: result.tailoredResumeId } }).catch(
          () => null,
        );
      }
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.some((part) => part === jobId),
      });
      toast.success(`Tailored resume v${result.version} ready with ${result.itemCount} items.`);
    } catch {
      toast.error("Generating the tailored resume failed. Please retry.");
    } finally {
      setBusy(null);
    }
  };

  const generateLetter = async () => {
    const resumeId = dataQuery.data?.resume?.id;
    if (!resumeId) return;
    setBusy("letter");
    try {
      const result = await generateCoverLetter({ data: { tailoredResumeId: resumeId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.some((part) => part === jobId),
      });
      toast.success(
        `Cover letter drafted with ${result.paragraphCount} evidence-backed paragraph${result.paragraphCount === 1 ? "" : "s"}.`,
      );
    } catch {
      toast.error("Drafting the cover letter failed. Please retry.");
    } finally {
      setBusy(null);
    }
  };

  const buildPackage = async () => {
    const data = dataQuery.data;
    if (!data?.resume || !data.job) return null;
    const { resume, job, profile, letter, items, sources, evidence } = data;
    const settings = normaliseSettings(resume.settings);

    const sourcesByItem = new Map<string, TailoredSourceRow[]>();
    for (const source of sources) {
      const list = sourcesByItem.get(source.tailored_resume_item_id) ?? [];
      list.push(source);
      sourcesByItem.set(source.tailored_resume_item_id, list);
    }

    const chosen = supportedOnly
      ? items.filter((item) => item.validation_status === "supported")
      : items;
    if (chosen.length === 0) {
      toast.error(
        supportedOnly
          ? "No claim is validated as supported yet, so a supported-only package would be empty. Validate the resume or switch the toggle off."
          : "This tailored resume has no items to export.",
      );
      return null;
    }

    const resumePdf = buildProfessionalResumePdf({
      profile: profile ?? null,
      jobTitle: job.title ?? null,
      version: resume.version,
      paperSize: settings.paper_size,
      onePage: settings.resume_length === "one_page",
      evidence: evidence as unknown as Map<string, ProEvidence>,
      items: chosen.map((item) => ({
        id: item.id,
        section: item.section,
        heading: item.heading,
        statement:
          item.validation_status === "unsupported"
            ? item.source_text?.trim() || item.statement
            : item.statement,
        evidenceIds: (sourcesByItem.get(item.id) ?? []).map((source) => source.resume_evidence_id),
      })),
    });

    const parts: Blob[] = [];
    let includedLetter = false;
    if (letter) {
      const body = coverLetterBody(letter);
      if (body.length > 0) {
        parts.push(
          buildCoverLetterPdf({
            profile: profile ?? null,
            jobTitle: job.title ?? null,
            jobCompany: job.company ?? null,
            recipient: letter.recipient,
            greeting: letter.greeting,
            body,
            signoff: letter.signoff,
            paperSize: settings.paper_size,
          }).blob,
        );
        includedLetter = true;
      }
    }
    parts.push(resumePdf.blob);

    const fileName = `${slugifyForFile([profile?.full_name, job.title, job.company]) || "application"}-application-package.pdf`;
    const merged = await mergePdfBlobs(parts, fileName);
    return { ...merged, includedLetter, itemCount: chosen.length };
  };

  const downloadPackage = async () => {
    setBusy("package");
    try {
      const result = await buildPackage();
      if (!result) return;
      downloadBlob(result.blob, result.fileName);
      const resume = dataQuery.data!.resume!;
      await supabase.from("exports").insert({
        user_id: user!.id,
        tailored_resume_id: resume.id,
        format: "pdf",
        file_name: result.fileName,
        status: "downloaded_application_package",
      });
      await snapshotTailoredResume({
        data: {
          tailoredResumeId: resume.id,
          reason: "export",
          label: `v${resume.version} · application package`,
          supportedOnly,
          exportFormat: "pdf",
          notes: `Application package with ${result.itemCount} resume items${result.includedLetter ? " and the cover letter" : " (resume only)"}.`,
        },
      }).catch(() => null);
      await refresh();
      toast.success(
        result.includedLetter
          ? "Application package downloaded: cover letter followed by your tailored resume."
          : "Package downloaded (resume only — no cover letter draft yet).",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Building the package failed.");
    } finally {
      setBusy(null);
    }
  };

  const logApplication = async () => {
    const data = dataQuery.data;
    if (!data?.resume || !data.job) return;
    setBusy("log");
    try {
      const appliedAt = new Date(`${form.applied_at}T12:00:00`);
      const { error } = await supabase.from("job_applications").insert({
        user_id: user!.id,
        job_id: data.job.id,
        tailored_resume_id: data.resume.id,
        tailored_resume_version: data.resume.version,
        cover_letter_id: data.letter?.id ?? null,
        job_title: data.job.title,
        company: data.job.company ?? null,
        sent_to: form.sent_to.trim() || null,
        channel: form.channel,
        status: form.status,
        applied_at: appliedAt.toISOString(),
        notes: form.notes.trim() || null,
      });
      if (error) throw new Error(error.message);
      setForm((prev) => ({ ...prev, sent_to: "", notes: "" }));
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.some((part) => part === "applications" || part === jobId),
      });
      toast.success(`Logged: tailored resume v${data.resume.version} sent.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logging the application failed.");
    } finally {
      setBusy(null);
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
        <p className="mt-3 text-sm">We couldn't load the application workspace for this job.</p>
        <Button variant="outline" className="mt-4" onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const { job, resume, letter, items, applications, hasMatchReport } = dataQuery.data;
  const supportedCount = items.filter((item) => item.validation_status === "supported").length;
  const flaggedCount = items.length - supportedCount;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/jobs/$jobId/match"
          params={{ jobId }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to match report
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Apply to this job</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {job.title}
            {job.company ? ` — ${job.company}` : ""}. Everything here is built from the match report
            for this job and your master resume evidence. Your master resume is never modified.
          </p>
        </div>
      </div>

      {!hasMatchReport ? (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">Run the match report first</CardTitle>
            <CardDescription>
              Tailoring needs the requirement-by-requirement match report so every generated line can
              cite the evidence behind it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/jobs/$jobId/match" params={{ jobId }}>
                Open match report
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-evidence" aria-hidden />
              1. Tailored resume
            </CardTitle>
            <CardDescription>
              {resume
                ? `Version ${resume.version} · ${items.length} items · ${supportedCount} supported${flaggedCount ? `, ${flaggedCount} flagged` : ""}`
                : "Not generated yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resume ? (
              <p className="text-xs text-muted-foreground">
                {settingsSummary(normaliseSettings(resume.settings))}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={resume ? "outline" : "default"}
                size="sm"
                disabled={busy !== null || !hasMatchReport}
                onClick={() => void generateResume()}
              >
                {busy === "resume" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {resume ? "Regenerate" : "Generate resume"}
              </Button>
              {resume ? (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/jobs/$jobId/tailored" params={{ jobId }}>
                    Review
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-evidence" aria-hidden />
              2. Cover letter
            </CardTitle>
            <CardDescription>
              {letter
                ? `${letter.paragraphs?.length ?? 0} body paragraph${(letter.paragraphs?.length ?? 0) === 1 ? "" : "s"} · ${letter.validation_status.replace(/_/g, " ")}`
                : "Not drafted yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant={letter ? "outline" : "default"}
              size="sm"
              disabled={busy !== null || !resume}
              onClick={() => void generateLetter()}
            >
              {busy === "letter" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="size-4" aria-hidden />
              )}
              {letter ? "Redraft" : "Draft letter"}
            </Button>
            {letter ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/jobs/$jobId/cover-letter" params={{ jobId }}>
                  Edit
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4 text-evidence" aria-hidden />
              3. Single PDF package
            </CardTitle>
            <CardDescription>
              Cover letter first, then the recruiter-facing resume — one file, no internal metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
              <Label htmlFor="supported-only" className="text-xs font-normal">
                Supported claims only
              </Label>
              <Switch
                id="supported-only"
                checked={supportedOnly}
                onCheckedChange={setSupportedOnly}
              />
            </div>
            <Button
              size="sm"
              disabled={busy !== null || !resume}
              onClick={() => void downloadPackage()}
            >
              {busy === "package" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="size-4" aria-hidden />
              )}
              Download package
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-evidence" aria-hidden />
            4. Log this application
          </CardTitle>
          <CardDescription>
            Records which tailored resume version you sent, where, and when — so the applications
            tracker stays accurate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="sent-to">Sent to</Label>
              <Input
                id="sent-to"
                placeholder="Recruiter name or careers portal"
                value={form.sent_to}
                onChange={(event) => setForm((p) => ({ ...p, sent_to: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="channel">Channel</Label>
              <Select
                value={form.channel}
                onValueChange={(value) => setForm((p) => ({ ...p, channel: value }))}
              >
                <SelectTrigger id="channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_CHANNELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {applicationChannelLabel[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((p) => ({ ...p, status: value }))}
              >
                <SelectTrigger id="status">
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
            <div className="space-y-1.5">
              <Label htmlFor="applied-at">Date applied</Label>
              <Input
                id="applied-at"
                type="date"
                max={toDateInputValue(new Date())}
                value={form.applied_at}
                onChange={(event) => setForm((p) => ({ ...p, applied_at: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Anything worth remembering about this submission."
              value={form.notes}
              onChange={(event) => setForm((p) => ({ ...p, notes: event.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy !== null || !resume} onClick={() => void logApplication()}>
              {busy === "log" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden />
              )}
              Log application
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/applications">Open applications tracker</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Applications logged for this job
        </h2>
        {applications.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nothing logged yet for this job.
          </p>
        ) : (
          <ul className="space-y-2">
            {applications.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <Badge variant="outline" className={applicationStatusBadgeClass[row.status]}>
                  {applicationStatusLabel[row.status] ?? row.status}
                </Badge>
                <span className="font-medium">
                  Resume v{row.tailored_resume_version ?? "?"}
                  {row.cover_letter_id ? " + cover letter" : ""}
                </span>
                <span className="text-muted-foreground">
                  {applicationChannelLabel[row.channel] ?? row.channel}
                  {row.sent_to ? ` · ${row.sent_to}` : ""}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {formatAppliedAt(row.applied_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
