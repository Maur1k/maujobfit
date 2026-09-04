import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileUp,
  History,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  SkipForward,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseResumeImport } from "@/lib/resume-import.functions";
import { validatePdfBytes } from "@/lib/pdf-validation";

import {
  IMPORT_SECTIONS,
  MAX_IMPORT_BYTES,
  PROFILE_FIELDS,
  importStatusLabel,
  normaliseBullets,
  type ImportItem,
  type ImportProfile,
  type ResumeImportRow,
} from "@/lib/resume-import";
import { sectionConfig } from "@/lib/master-resume";
import { ImportItemCard } from "@/components/import/ImportItemCard";
import { EvidencePrinciple } from "@/components/EvidencePrinciple";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import Resume PDF — MauJobFit" },
      {
        name: "description",
        content:
          "Upload a resume PDF, review every extracted entry and bullet, then merge only what you approve into your Master Resume.",
      },
      { property: "og:title", content: "Import Resume PDF — MauJobFit" },
      {
        property: "og:description",
        content: "Review extracted resume content before anything reaches your Master Resume.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

type ImportData = { row: ResumeImportRow; items: ImportItem[] };

function ImportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeMode, setMergeMode] = useState<"append" | "replace">("append");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);

  const importsQuery = useQuery({
    queryKey: ["resume-imports", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resume_imports")
        .select(
          "id, file_name, file_path, file_size, status, error_message, raw_text, parsed_profile, parsed_summary, summary_status, profile_status, page_count, parsed_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as ResumeImportRow[];
    },
    enabled: !!user,
  });

  const activeId = selectedId ?? importsQuery.data?.[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ["resume-import", activeId],
    queryFn: async (): Promise<ImportData | null> => {
      if (!activeId) return null;
      const { data: row, error } = await supabase
        .from("resume_imports")
        .select(
          "id, file_name, file_path, file_size, status, error_message, raw_text, parsed_profile, parsed_summary, summary_status, profile_status, page_count, parsed_at, created_at",
        )
        .eq("id", activeId)
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;

      const { data: items, error: itemsError } = await supabase
        .from("resume_import_items")
        .select(
          "id, resume_import_id, section, title, organization, role, location, start_date, end_date, url, description, skills, bullets, status, merged_resume_item_id, sort_order",
        )
        .eq("resume_import_id", activeId)
        .order("sort_order", { ascending: true });
      if (itemsError) throw itemsError;

      return {
        row: row as unknown as ResumeImportRow,
        items: (items ?? []).map((item) => ({
          ...(item as unknown as ImportItem),
          bullets: normaliseBullets((item as { bullets: unknown }).bullets),
        })),
      };
    },
    enabled: !!activeId,
  });

  const detail = detailQuery.data ?? null;
  const row = detail?.row ?? null;
  const items = detail?.items ?? [];
  const locked = row?.status === "merged";

  const grouped = useMemo(
    () =>
      IMPORT_SECTIONS.map((section) => ({
        section,
        config: sectionConfig(section),
        items: items.filter((item) => item.section === section),
      })).filter((group) => group.items.length > 0),
    [items],
  );

  const acceptedCount = items.filter((i) => i.status === "accepted" && !i.merged_resume_item_id)
    .length;
  const acceptedBulletCount = items
    .filter((i) => i.status === "accepted" && !i.merged_resume_item_id)
    .reduce((sum, i) => sum + i.bullets.filter((b) => b.status === "accepted").length, 0);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["resume-import"] });
    queryClient.invalidateQueries({ queryKey: ["resume-imports"] });
  };


  const runParse = async (importId: string) => {
    setParsing(true);
    try {
      const result = await parseResumeImport({ data: { importId } });
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success(`Extracted ${result.itemCount} entries for review`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Parsing failed. Please retry.");
    } finally {
      setParsing(false);
      refresh();
    }
  };

  const onUpload = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("That file is larger than 15 MB. Please upload a smaller PDF.");
      return;
    }

    // Fast local feedback only — the server re-validates the stored bytes
    // before anything is parsed, so this cannot be used to bypass checks.
    const check = validatePdfBytes(new Uint8Array(await file.arrayBuffer()));
    if (!check.ok) {
      toast.error(check.error);
      return;
    }


    setUploading(true);
    const { data: created, error: insertError } = await supabase
      .from("resume_imports")
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_size: file.size,
        mime_type: "application/pdf",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !created) {
      setUploading(false);
      toast.error(insertError?.message ?? "Could not start the import.");
      return;
    }

    const path = `${user.id}/${created.id}.pdf`;
    const upload = await supabase.storage
      .from("resume-imports")
      .upload(path, file, { contentType: "application/pdf", upsert: true });

    if (upload.error) {
      await supabase
        .from("resume_imports")
        .update({ status: "failed", error_message: upload.error.message })
        .eq("id", created.id);
      setUploading(false);
      refresh();
      toast.error("Upload failed. Please try again.");
      return;
    }

    await supabase.from("resume_imports").update({ file_path: path }).eq("id", created.id);
    setUploading(false);
    setSelectedId(created.id);
    setSummaryDraft(null);
    queryClient.invalidateQueries({ queryKey: ["resume-imports", user.id] });
    await runParse(created.id);
  };

  const setImportField = async (values: Record<string, unknown>) => {
    if (!row) return;
    const { error } = await supabase.from("resume_imports").update(values as never).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const mergeAccepted = async () => {
    if (!row || !user) return;
    setMerging(true);
    try {
      let masterId: string | null = null;
      const { data: master } = await supabase
        .from("master_resumes")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (master) {
        masterId = master.id;
      } else {
        const { data: createdMaster, error } = await supabase
          .from("master_resumes")
          .insert({ user_id: user.id, title: "Master Resume" })
          .select("id")
          .single();
        if (error || !createdMaster) throw new Error(error?.message ?? "Could not create the master resume.");
        masterId = createdMaster.id;
      }

      if (row.profile_status === "accepted" && row.parsed_profile) {
        const profile = row.parsed_profile as ImportProfile;
        const patch: Record<string, string> = {};
        for (const { key } of PROFILE_FIELDS) {
          const value = profile[key];
          if (typeof value === "string" && value.trim()) patch[key] = value.trim();
        }
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("profiles").update(patch as never).eq("id", user.id);
          if (error) throw new Error(error.message);
        }
      }

      if (row.summary_status === "accepted" && (summaryDraft ?? row.parsed_summary)) {
        const { error } = await supabase
          .from("master_resumes")
          .update({ summary: (summaryDraft ?? row.parsed_summary)!.trim() })
          .eq("id", masterId);
        if (error) throw new Error(error.message);
      }

      let nextSort = 0;

      if (mergeMode === "replace") {
        // Replace mode: clear the existing entries (their bullets and evidence
        // records cascade) so the Master Resume mirrors this import only.
        const { error: clearError } = await supabase
          .from("resume_items")
          .delete()
          .eq("master_resume_id", masterId);
        if (clearError) throw new Error(clearError.message);
      } else {
        const { data: existing } = await supabase
          .from("resume_items")
          .select("sort_order")
          .eq("master_resume_id", masterId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        nextSort = (existing?.sort_order ?? -1) + 1;
      }

      const toMerge = items.filter((i) => i.status === "accepted" && !i.merged_resume_item_id);
      let bulletTotal = 0;

      for (const item of toMerge) {
        const { data: inserted, error } = await supabase
          .from("resume_items")
          .insert({
            user_id: user.id,
            master_resume_id: masterId,
            resume_import_id: row.id,
            section: item.section,
            title: item.title,
            organization: item.organization,
            role: item.role,
            location: item.location,
            start_date: item.start_date,
            end_date: item.end_date,
            url: item.url,
            description: item.description,
            skills: item.skills ?? [],
            sort_order: nextSort++,
          })
          .select("id")
          .single();
        if (error || !inserted) throw new Error(error?.message ?? "Could not merge an entry.");

        const bullets = item.bullets.filter((b) => b.status === "accepted");
        if (bullets.length > 0) {
          const { error: bulletError } = await supabase.from("resume_item_bullets").insert(
            bullets.map((bullet, index) => ({
              user_id: user.id,
              resume_item_id: inserted.id,
              content: bullet.content,
              sort_order: index,
            })),
          );
          if (bulletError) throw new Error(bulletError.message);
          bulletTotal += bullets.length;
        }

        await supabase
          .from("resume_import_items")
          .update({ merged_resume_item_id: inserted.id, status: "accepted" })
          .eq("id", item.id);
      }

      await supabase.from("resume_imports").update({ status: "merged" }).eq("id", row.id);
      queryClient.invalidateQueries({ queryKey: ["master-resume", user.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", user.id] });
      refresh();
      toast.success(
        `${mergeMode === "replace" ? "Replaced your Master Resume with" : "Merged"} ${
          toMerge.length
        } ${toMerge.length === 1 ? "entry" : "entries"} · ${
          toMerge.length + bulletTotal
        } evidence records created`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed.");
    } finally {
      setMerging(false);
    }
  };

  const busy = uploading || parsing;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">Import a resume PDF</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          MauJobFit reads your PDF and drafts structured entries for review. Nothing is written to
          your Master Resume until you accept it here.
        </p>
      </div>

      <EvidencePrinciple />

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            Text-based PDF exports only, up to 15 MB. Scanned images cannot be read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 px-6 py-10 text-center transition-colors hover:bg-secondary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && !busy) onUpload(file);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <div className="rounded-md bg-card p-3 shadow-sm">
              {busy ? (
                <Loader2 className="size-6 animate-spin text-evidence" aria-hidden />
              ) : (
                <FileUp className="size-6 text-evidence" aria-hidden />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {uploading
                  ? "Uploading your file…"
                  : parsing
                    ? "Reading and structuring your resume…"
                    : "Drop a PDF here or click to choose a file"}
              </p>
              <p className="text-xs text-muted-foreground">
                Your file is stored privately and is only accessible from your account.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {importsQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (importsQuery.data?.length ?? 0) === 0 ? null : (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" aria-hidden /> Your imports
              </CardTitle>
              <CardDescription>Select an import to review its extracted draft.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {importsQuery.data!.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  setSelectedId(entry.id);
                  setSummaryDraft(null);
                }}
                className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                  entry.id === activeId
                    ? "border-evidence/50 bg-evidence/5"
                    : "border-border hover:bg-secondary/50"
                }`}
              >
                <span className="min-w-0 truncate font-medium">{entry.file_name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleDateString()}
                  <Badge
                    variant={
                      entry.status === "failed"
                        ? "destructive"
                        : entry.status === "merged"
                          ? "default"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {importStatusLabel(entry.status)}
                  </Badge>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {detailQuery.isPending && activeId ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : row ? (
        <div className="space-y-6">
          {row.status === "failed" && (
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-medium">This import could not be read</p>
                  <p className="text-sm text-muted-foreground">
                    {row.error_message ?? "Something went wrong while reading the PDF."}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => runParse(row.id)} disabled={parsing}>
                {parsing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCcw className="size-4" aria-hidden />
                )}
                Retry
              </Button>
            </div>
          )}

          {(row.status === "ready" || row.status === "merged") && (
            <>
              <Card>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>Review draft</CardTitle>
                    <CardDescription>
                      {items.length} entries extracted
                      {row.page_count ? ` from ${row.page_count} page(s)` : ""} · accept only what is
                      accurate.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!locked && (
                      <Button variant="outline" size="sm" onClick={() => runParse(row.id)} disabled={parsing}>
                        {parsing ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCcw className="size-4" aria-hidden />
                        )}
                        Re-extract
                      </Button>
                    )}
                    {locked ? (
                      <Button asChild size="sm">
                        <Link to="/master-resume">View Master Resume</Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          mergeMode === "replace" ? setConfirmReplace(true) : mergeAccepted()
                        }
                        disabled={
                          merging ||
                          (acceptedCount === 0 &&
                            row.profile_status !== "accepted" &&
                            row.summary_status !== "accepted")
                        }
                      >
                        {merging ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Upload className="size-4" aria-hidden />
                        )}
                        {mergeMode === "replace"
                          ? `Replace Master Resume (${acceptedCount})`
                          : `Merge accepted (${acceptedCount})`}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!locked && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">How should this be applied?</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            {
                              value: "append" as const,
                              label: "Add to Master Resume",
                              hint: "Keeps everything already in your Master Resume and appends the accepted entries.",
                            },
                            {
                              value: "replace" as const,
                              label: "Replace Master Resume",
                              hint: "Deletes your current entries, bullets and their evidence records, then writes only the accepted entries from this PDF.",
                            },
                          ]
                        ).map((option) => (
                          <label
                            key={option.value}
                            className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors ${
                              mergeMode === option.value
                                ? "border-evidence/50 bg-evidence/5"
                                : "border-border hover:bg-secondary/50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="merge-mode"
                              className="mt-1 size-4 accent-[hsl(var(--evidence))]"
                              value={option.value}
                              checked={mergeMode === option.value}
                              onChange={() => setMergeMode(option.value)}
                            />
                            <span className="space-y-1">
                              <span className="block font-medium">{option.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {option.hint}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="size-3 text-evidence" aria-hidden />
                      {acceptedCount + acceptedBulletCount} evidence records on merge
                    </Badge>
                    <Badge variant="outline">
                      {items.filter((i) => i.status === "skipped").length} skipped
                    </Badge>
                    <Badge variant="outline">
                      {items.filter((i) => i.status === "pending").length} undecided
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contact details</CardTitle>
                  <CardDescription>
                    Accepting replaces the matching fields on your profile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PROFILE_FIELDS.map(({ key, label }) => {
                      const value = (row.parsed_profile ?? {})[key];
                      return (
                        <div key={key} className="rounded-md bg-secondary/40 px-3 py-2">
                          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                            {label}
                          </p>
                          <p className="truncate text-sm">{value || "—"}</p>
                        </div>
                      );
                    })}
                  </div>
                  {!locked && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={row.profile_status === "accepted" ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          setImportField({
                            profile_status: row.profile_status === "accepted" ? "pending" : "accepted",
                          })
                        }
                      >
                        <Check className="size-4" aria-hidden />
                        {row.profile_status === "accepted" ? "Accepted" : "Accept contact details"}
                      </Button>
                      <Button
                        variant={row.profile_status === "skipped" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setImportField({
                            profile_status: row.profile_status === "skipped" ? "pending" : "skipped",
                          })
                        }
                      >
                        <SkipForward className="size-4" aria-hidden />
                        {row.profile_status === "skipped" ? "Unskip" : "Skip"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Professional summary</CardTitle>
                  <CardDescription>
                    Accepting replaces your master resume summary and its evidence record.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {row.parsed_summary ? (
                    <Textarea
                      rows={4}
                      readOnly={locked}
                      value={summaryDraft ?? row.parsed_summary}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      onBlur={() => {
                        if (summaryDraft !== null && summaryDraft !== row.parsed_summary) {
                          setImportField({ parsed_summary: summaryDraft });
                        }
                      }}
                    />
                  ) : (
                    <p className="rounded-md border border-dashed border-border bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground">
                      No summary detected in this PDF.
                    </p>
                  )}
                  {!locked && row.parsed_summary && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={row.summary_status === "accepted" ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          setImportField({
                            summary_status: row.summary_status === "accepted" ? "pending" : "accepted",
                          })
                        }
                      >
                        <Check className="size-4" aria-hidden />
                        {row.summary_status === "accepted" ? "Accepted" : "Accept summary"}
                      </Button>
                      <Button
                        variant={row.summary_status === "skipped" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          setImportField({
                            summary_status: row.summary_status === "skipped" ? "pending" : "skipped",
                          })
                        }
                      >
                        <SkipForward className="size-4" aria-hidden />
                        {row.summary_status === "skipped" ? "Unskip" : "Skip"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {grouped.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-6 py-12 text-center">
                  <p className="text-sm font-medium">No entries were extracted</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try re-extracting, or add entries by hand in the Master Resume editor.
                  </p>
                </div>
              ) : (
                grouped.map((group) => (
                  <section key={group.section} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-semibold">
                        {group.config?.label ?? group.section}
                      </h2>
                      <Badge variant="secondary">{group.items.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <ImportItemCard
                          key={item.id}
                          item={item}
                          locked={!!locked}
                          onChanged={refresh}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </>
          )}

          {(row.status === "pending" || row.status === "parsing") && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-6">
              <Loader2 className="size-5 animate-spin text-evidence" aria-hidden />
              <div>
                <p className="text-sm font-medium">Reading your resume…</p>
                <p className="text-sm text-muted-foreground">
                  This usually takes a few seconds. Extraction never edits your Master Resume.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
