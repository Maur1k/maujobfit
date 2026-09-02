import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EvidencePrinciple } from "@/components/EvidencePrinciple";
import { ResumeItemDialog } from "@/components/resume/ResumeItemDialog";
import { ResumePreview } from "@/components/resume/ResumePreview";
import type { ResumeItem } from "@/components/resume/types";
import { SECTIONS, SUMMARY_EXAMPLE, dateRange, sectionConfig } from "@/lib/master-resume";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/master-resume")({
  head: () => ({
    meta: [
      { title: "Master Resume Editor — MauJobFit" },
      {
        name: "description",
        content:
          "Build your canonical career record section by section. Every entry and bullet is stored as an atomic evidence record with provenance.",
      },
      { property: "og:title", content: "Master Resume Editor — MauJobFit" },
      {
        property: "og:description",
        content: "One canonical career record, stored as citable atomic evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MasterResumePage,
});

type NavKey = "profile" | "summary" | (typeof SECTIONS)[number]["key"] | "preview";

const profileFields = [
  { key: "full_name", label: "Full name" },
  { key: "headline", label: "Headline" },
  { key: "email", label: "Contact email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "portfolio_url", label: "Portfolio URL" },
  { key: "github_url", label: "GitHub URL" },
  { key: "linkedin_url", label: "LinkedIn URL" },
] as const;

function MasterResumePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<NavKey>("profile");
  const [creating, setCreating] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<Record<string, string> | null>(null);
  const [dialogSection, setDialogSection] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ResumeItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ResumeItem | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["master-resume", user?.id],
    queryFn: async () => {
      const { data: master, error } = await supabase
        .from("master_resumes")
        .select("id, title, summary, status, updated_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "full_name, headline, email, phone, location, portfolio_url, github_url, linkedin_url",
        )
        .eq("id", user!.id)
        .maybeSingle();

      if (!master) return { master: null, items: [] as ResumeItem[], evidenceCount: 0, profile };

      const { data: items } = await supabase
        .from("resume_items")
        .select(
          "id, section, title, organization, role, location, start_date, end_date, url, description, skills, sort_order, resume_item_bullets(id, content, sort_order)",
        )
        .eq("master_resume_id", master.id)
        .order("sort_order", { ascending: true });

      const { count } = await supabase
        .from("resume_evidence")
        .select("id", { count: "exact", head: true })
        .eq("master_resume_id", master.id);

      return {
        master,
        profile,
        items: (items ?? []) as ResumeItem[],
        evidenceCount: count ?? 0,
      };
    },
    enabled: !!user,
  });

  const master = data?.master ?? null;
  const items = data?.items ?? [];
  const summaryValue = summaryDraft ?? master?.summary ?? "";
  const profileValues = useMemo(() => {
    if (profileDraft) return profileDraft;
    return profileFields.reduce(
      (acc, f) => ({
        ...acc,
        [f.key]: ((data?.profile as Record<string, string | null> | null)?.[f.key] ?? "") as string,
      }),
      {} as Record<string, string>,
    );
  }, [profileDraft, data?.profile]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["master-resume", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
  };

  const createMaster = async () => {
    if (!user) return;
    setCreating(true);
    const { error } = await supabase
      .from("master_resumes")
      .insert({ user_id: user.id, title: "Master Resume", status: "draft" });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Master Resume created — start with your profile header.");
    refresh();
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const payload = profileFields.reduce(
      (acc, f) => ({ ...acc, [f.key]: (profileValues[f.key] ?? "").trim() || null }),
      {} as Record<string, string | null>,
    );
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...payload }, { onConflict: "id" });
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile header saved");
    setProfileDraft(null);
    refresh();
  };

  const saveSummary = async () => {
    if (!master) return;
    setSavingSummary(true);
    const { error } = await supabase
      .from("master_resumes")
      .update({ summary: summaryValue.trim() || null })
      .eq("id", master.id);
    setSavingSummary(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      summaryValue.trim()
        ? "Summary saved · 1 evidence record synced"
        : "Summary cleared · its evidence record was removed",
    );
    setSummaryDraft(null);
    refresh();
  };

  const move = async (item: ResumeItem, direction: -1 | 1) => {
    const siblings = items
      .filter((i) => i.section === item.section)
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = siblings.findIndex((i) => i.id === item.id);
    const target = siblings[index + direction];
    if (!target) return;
    await supabase.from("resume_items").update({ sort_order: target.sort_order }).eq("id", item.id);
    await supabase
      .from("resume_items")
      .update({ sort_order: item.sort_order })
      .eq("id", target.id);
    refresh();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from("resume_items").delete().eq("id", pendingDelete.id);
    setPendingDelete(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry deleted along with its evidence records");
    refresh();
  };

  const countFor = (key: string) => items.filter((i) => i.section === key).length;

  const nav: { key: NavKey; label: string; badge?: number }[] = [
    { key: "profile", label: "Profile" },
    { key: "summary", label: "Professional summary" },
    ...SECTIONS.map((s) => ({ key: s.key as NavKey, label: s.label, badge: countFor(s.key) })),
    { key: "preview", label: "Preview" },
  ];

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!master) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Master Resume</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The single source of truth for your career. Everything you enter is stored as an atomic
            evidence record so tailored resumes can cite it precisely.
          </p>
        </div>
        <EvidencePrinciple />
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto size-9 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold">Set up your Master Resume</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Build it record by record. Nothing is generated for you — the library only ever holds
              facts you supplied and approved.
            </p>
            <Button className="mt-6" onClick={createMaster} disabled={creating}>
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Create Master Resume
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeSection = sectionConfig(active);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Master Resume</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Edit each section below. Every entry, and every bullet inside it, is stored as its own
            evidence record with a stable ID that traces back to this source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{master.status}</Badge>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="size-3.5 text-evidence" aria-hidden />
            {data?.evidenceCount ?? 0} evidence
          </Badge>
        </div>
      </div>

      <EvidencePrinciple />

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Resume sections" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {nav.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => setActive(entry.key)}
                  aria-current={active === entry.key ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active === entry.key
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  {entry.label}
                  {entry.badge ? (
                    <span className="font-mono text-xs text-muted-foreground">{entry.badge}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {active === "profile" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="size-4" aria-hidden />
                  Profile header
                </CardTitle>
                <CardDescription>
                  Contact details that head every resume. Visible only to you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
                  {profileFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`p-${field.key}`}>{field.label}</Label>
                      <Input
                        id={`p-${field.key}`}
                        value={profileValues[field.key] ?? ""}
                        onChange={(e) =>
                          setProfileDraft({ ...profileValues, [field.key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      Save profile header
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {active === "summary" ? (
            <Card>
              <CardHeader>
                <CardTitle>Professional summary</CardTitle>
                <CardDescription>
                  Stored as a single evidence record. Tailored summaries may only rephrase what this
                  says — they cannot add new claims.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  rows={6}
                  aria-label="Professional summary"
                  placeholder="Two to four sentences on what you do, the systems you have shipped and the stack you work in."
                  value={summaryValue}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={saveSummary} disabled={savingSummary}>
                    {savingSummary ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Save summary
                  </Button>
                  <Button variant="ghost" onClick={() => setSummaryDraft(SUMMARY_EXAMPLE)}>
                    <Sparkles className="size-4" aria-hidden />
                    Load example copy
                  </Button>
                  {summaryDraft !== null ? (
                    <span className="text-xs text-muted-foreground">Unsaved changes</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeSection ? (
            <Card>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle>{activeSection.label}</CardTitle>
                  <CardDescription className="max-w-xl">{activeSection.blurb}</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setDialogSection(activeSection.key);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add {activeSection.singular}
                </Button>
              </CardHeader>
              <CardContent>
                {countFor(activeSection.key) === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
                    <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
                    <p className="mt-4 font-display text-lg font-semibold">
                      No {activeSection.label.toLowerCase()} recorded yet
                    </p>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                      Add your first {activeSection.singular} — it becomes a citable record straight
                      away, and any bullets you write become evidence of their own.
                    </p>
                    <Button
                      className="mt-6"
                      onClick={() => {
                        setEditingItem(null);
                        setDialogSection(activeSection.key);
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      Add {activeSection.singular}
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {items
                      .filter((i) => i.section === activeSection.key)
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item, index, arr) => (
                        <li
                          key={item.id}
                          className="rounded-lg border border-border bg-card p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium">{item.role || item.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {[item.organization, item.location, dateRange(item.start_date, item.end_date)]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {item.description ? (
                                <p className="text-sm leading-relaxed">{item.description}</p>
                              ) : null}
                              {item.skills.length ? (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {item.skills.map((skill) => (
                                    <Badge key={skill} variant="secondary">
                                      {skill}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                              {item.resume_item_bullets.length ? (
                                <ul className="mt-2 space-y-1.5">
                                  {[...item.resume_item_bullets]
                                    .sort((a, b) => a.sort_order - b.sort_order)
                                    .map((bullet) => (
                                      <li
                                        key={bullet.id}
                                        className="flex items-start gap-2 text-sm leading-relaxed"
                                      >
                                        <ShieldCheck
                                          className="mt-0.5 size-3.5 shrink-0 text-evidence"
                                          aria-hidden
                                        />
                                        <span>{bullet.content}</span>
                                      </li>
                                    ))}
                                </ul>
                              ) : null}
                              <p className="pt-2 font-mono text-xs text-muted-foreground">
                                {1 + item.resume_item_bullets.length} evidence · id{" "}
                                {item.id.slice(0, 8)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Move up"
                                disabled={index === 0}
                                onClick={() => move(item, -1)}
                              >
                                <ArrowUp className="size-4" aria-hidden />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Move down"
                                disabled={index === arr.length - 1}
                                onClick={() => move(item, 1)}
                              >
                                <ArrowDown className="size-4" aria-hidden />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${activeSection.singular}`}
                                onClick={() => {
                                  setEditingItem(item);
                                  setDialogSection(activeSection.key);
                                }}
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${activeSection.singular}`}
                                onClick={() => setPendingDelete(item)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {active === "preview" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Eye className="size-4 text-muted-foreground" aria-hidden />
                <h2 className="text-lg font-semibold">Preview</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                A plain reading of your record. Tailored resumes will be assembled only from these
                approved evidence records — never from invented content.
              </p>
              <ResumePreview
                profile={(data?.profile as never) ?? null}
                summary={master.summary}
                items={items}
              />
            </div>
          ) : null}
        </div>
      </div>

      {dialogSection && user ? (
        <ResumeItemDialog
          section={sectionConfig(dialogSection)!}
          item={editingItem}
          open={!!dialogSection}
          onOpenChange={(open) => {
            if (!open) {
              setDialogSection(null);
              setEditingItem(null);
            }
          }}
          masterResumeId={master.id}
          userId={user.id}
          nextSortOrder={countFor(dialogSection)}
          onSaved={refresh}
        />
      ) : null}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Its evidence records — including one per bullet — are removed too, so nothing can cite
              it afterwards. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
