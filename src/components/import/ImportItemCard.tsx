import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, ShieldCheck, SkipForward, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { dateRange, sectionConfig } from "@/lib/master-resume";
import { itemHeadline, type ImportBullet, type ImportItem } from "@/lib/resume-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const EDIT_FIELDS = [
  { key: "role", label: "Job title" },
  { key: "title", label: "Title / name" },
  { key: "organization", label: "Organization" },
  { key: "location", label: "Location" },
  { key: "start_date", label: "Start" },
  { key: "end_date", label: "End" },
  { key: "url", label: "Link" },
] as const;

type Draft = {
  role: string;
  title: string;
  organization: string;
  location: string;
  start_date: string;
  end_date: string;
  url: string;
  description: string;
  skills: string;
  bullets: ImportBullet[];
};

const toDraft = (item: ImportItem): Draft => ({
  role: item.role ?? "",
  title: item.title ?? "",
  organization: item.organization ?? "",
  location: item.location ?? "",
  start_date: item.start_date ?? "",
  end_date: item.end_date ?? "",
  url: item.url ?? "",
  description: item.description ?? "",
  skills: (item.skills ?? []).join(", "),
  bullets: item.bullets ?? [],
});

export function ImportItemCard({
  item,
  locked,
  onChanged,
}: {
  item: ImportItem;
  locked: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const config = sectionConfig(item.section);

  useEffect(() => {
    if (!editing) setDraft(toDraft(item));
  }, [item, editing]);

  const merged = !!item.merged_resume_item_id;
  const accepted = item.status === "accepted";
  const skipped = item.status === "skipped";

  const patch = async (values: Record<string, unknown>) => {
    setSaving(true);
    const { error } = await supabase.from("resume_import_items").update(values).eq("id", item.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    onChanged();
    return true;
  };

  const setStatus = async (status: "accepted" | "skipped" | "pending") => {
    if (await patch({ status })) {
      toast.success(
        status === "accepted"
          ? "Marked for merge"
          : status === "skipped"
            ? "Skipped — it will not reach your Master Resume"
            : "Reset to pending",
      );
    }
  };

  const toggleBullet = async (bulletId: string) => {
    const next = draft.bullets.map((b) =>
      b.id === bulletId
        ? { ...b, status: b.status === "accepted" ? ("skipped" as const) : ("accepted" as const) }
        : b,
    );
    setDraft((d) => ({ ...d, bullets: next }));
    await patch({ bullets: next });
  };

  const save = async () => {
    const bullets = draft.bullets.filter((b) => b.content.trim().length > 0);
    const ok = await patch({
      role: draft.role.trim() || null,
      title: draft.title.trim() || null,
      organization: draft.organization.trim() || null,
      location: draft.location.trim() || null,
      start_date: draft.start_date.trim() || null,
      end_date: draft.end_date.trim() || null,
      url: draft.url.trim() || null,
      description: draft.description.trim() || null,
      skills: draft.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      bullets,
    });
    if (ok) {
      setEditing(false);
      toast.success("Extracted entry updated");
    }
  };

  const acceptedBullets = (item.bullets ?? []).filter((b) => b.status === "accepted").length;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        skipped
          ? "border-dashed border-border bg-secondary/20 opacity-70"
          : accepted || merged
            ? "border-evidence/40 bg-evidence/5"
            : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{itemHeadline(item)}</p>
            <Badge variant="secondary" className="text-xs">
              {config?.singular ?? item.section}
            </Badge>
            {merged ? (
              <Badge className="gap-1 text-xs">
                <ShieldCheck className="size-3" aria-hidden /> Merged
              </Badge>
            ) : accepted ? (
              <Badge className="text-xs">Will merge</Badge>
            ) : skipped ? (
              <Badge variant="outline" className="text-xs">
                Skipped
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {[item.organization, item.location, dateRange(item.start_date, item.end_date)]
              .filter(Boolean)
              .join(" · ") || "No dates or organization detected"}
          </p>
        </div>

        {!locked && !merged && (
          <div className="flex shrink-0 items-center gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? <X className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
              {editing ? "Cancel" : "Edit"}
            </Button>
            <Button
              variant={skipped ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatus(skipped ? "pending" : "skipped")}
            >
              <SkipForward className="size-4" aria-hidden />
              {skipped ? "Unskip" : "Skip"}
            </Button>
            <Button
              variant={accepted ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(accepted ? "pending" : "accepted")}
            >
              <Check className="size-4" aria-hidden />
              {accepted ? "Accepted" : "Accept"}
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {EDIT_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${item.id}-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`${item.id}-${key}`}
                  value={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${item.id}-description`} className="text-xs">
              Context
            </Label>
            <Textarea
              id={`${item.id}-description`}
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${item.id}-skills`} className="text-xs">
              Skills (comma separated)
            </Label>
            <Input
              id={`${item.id}-skills`}
              value={draft.skills}
              onChange={(e) => setDraft((d) => ({ ...d, skills: e.target.value }))}
            />
          </div>
          {draft.bullets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Bullets — each becomes its own evidence record</Label>
              {draft.bullets.map((bullet, index) => (
                <Textarea
                  key={bullet.id}
                  rows={2}
                  value={bullet.content}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      bullets: d.bullets.map((b, i) =>
                        i === index ? { ...b, content: e.target.value } : b,
                      ),
                    }))
                  }
                />
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {item.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          )}
          {(item.skills ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.skills.map((skill) => (
                <Badge key={skill} variant="outline" className="font-mono text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          )}
          {(item.bullets ?? []).length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {acceptedBullets}/{item.bullets.length} bullets selected
              </p>
              {item.bullets.map((bullet) => (
                <label
                  key={bullet.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md bg-secondary/50 px-3 py-2 text-sm"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={bullet.status === "accepted"}
                    disabled={locked || merged}
                    onCheckedChange={() => toggleBullet(bullet.id)}
                  />
                  <span
                    className={bullet.status === "accepted" ? "" : "text-muted-foreground line-through"}
                  >
                    {bullet.content}
                  </span>
                </label>
              ))}
            </div>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-xs text-evidence underline"
            >
              {item.url}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
