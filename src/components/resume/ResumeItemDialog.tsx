import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { FieldKey, SectionConfig } from "@/lib/master-resume";
import { isValidUrl } from "@/lib/master-resume";
import type { ResumeItem } from "@/components/resume/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BulletDraft = { id: string | null; content: string };
type FormState = Record<FieldKey, string>;

const FIELD_KEYS: FieldKey[] = [
  "title",
  "organization",
  "role",
  "location",
  "start_date",
  "end_date",
  "url",
  "description",
];

const emptyForm = () =>
  FIELD_KEYS.reduce((acc, key) => ({ ...acc, [key]: "" }), {} as FormState);

export function ResumeItemDialog({
  section,
  item,
  open,
  onOpenChange,
  masterResumeId,
  userId,
  nextSortOrder,
  onSaved,
}: {
  section: SectionConfig;
  item: ResumeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterResumeId: string;
  userId: string;
  nextSortOrder: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [bullets, setBullets] = useState<BulletDraft[]>([]);
  const [removedBulletIds, setRemovedBulletIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSkillDraft("");
    setRemovedBulletIds([]);
    if (item) {
      setForm(
        FIELD_KEYS.reduce(
          (acc, key) => ({ ...acc, [key]: (item[key] as string | null) ?? "" }),
          emptyForm(),
        ),
      );
      setSkills(item.skills ?? []);
      setBullets(
        [...(item.resume_item_bullets ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => ({ id: b.id, content: b.content })),
      );
    } else {
      setForm(emptyForm());
      setSkills([]);
      setBullets(section.bullets ? [{ id: null, content: "" }] : []);
    }
  }, [open, item, section]);

  const visibleFields = useMemo(() => section.fields, [section]);

  const addSkill = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setSkills((prev) => [...prev, ...parts.filter((p) => !prev.includes(p))]);
    setSkillDraft("");
  };

  const loadExample = () => {
    const ex = section.example;
    setForm((prev) => {
      const next = { ...prev };
      FIELD_KEYS.forEach((key) => {
        const value = ex[key];
        if (value) next[key] = value;
      });
      return next;
    });
    if (ex.skills?.length) setSkills(ex.skills);
    if (ex.bullets?.length) setBullets(ex.bullets.map((content) => ({ id: null, content })));
    setErrors({});
    toast.info("Example copy loaded into the form — edit it before saving.");
  };

  const validate = () => {
    const next: Record<string, string> = {};
    visibleFields.forEach((field) => {
      const value = form[field.key].trim();
      if (field.required && !value) next[field.key] = `${field.label} is required.`;
      if (field.type === "url" && value && !isValidUrl(value))
        next[field.key] = "Enter a full URL starting with http:// or https://";
    });
    if (section.skillsRequired && skills.length === 0)
      next["skills"] = "Add at least one skill to this group.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    setSaving(true);

    const payload = {
      user_id: userId,
      master_resume_id: masterResumeId,
      section: section.key,
      skills,
      ...FIELD_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: form[key].trim() || null }),
        {} as Record<FieldKey, string | null>,
      ),
    };

    let itemId = item?.id ?? null;

    if (itemId) {
      const { error } = await supabase.from("resume_items").update(payload).eq("id", itemId);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("resume_items")
        .insert({ ...payload, sort_order: nextSortOrder })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        toast.error(error?.message ?? "Could not save this entry.");
        return;
      }
      itemId = data.id;
    }

    const kept = bullets.map((b) => ({ ...b, content: b.content.trim() })).filter((b) => b.content);

    if (removedBulletIds.length) {
      await supabase.from("resume_item_bullets").delete().in("id", removedBulletIds);
    }
    const emptied = bullets.filter((b) => b.id && !b.content.trim()).map((b) => b.id as string);
    if (emptied.length) await supabase.from("resume_item_bullets").delete().in("id", emptied);

    for (const [index, bullet] of kept.entries()) {
      if (bullet.id) {
        await supabase
          .from("resume_item_bullets")
          .update({ content: bullet.content, sort_order: index })
          .eq("id", bullet.id);
      } else {
        await supabase.from("resume_item_bullets").insert({
          user_id: userId,
          resume_item_id: itemId,
          content: bullet.content,
          sort_order: index,
        });
      }
    }

    setSaving(false);
    const evidenceCount = 1 + kept.length;
    toast.success(
      `${item ? "Updated" : "Added"} ${section.singular} · ${evidenceCount} evidence record${
        evidenceCount === 1 ? "" : "s"
      } synced`,
    );
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit" : "Add"} {section.singular}
          </DialogTitle>
          <DialogDescription>{section.blurb}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleFields.map((field) => {
              const spanFull = !field.half && field.type !== "url" ? true : field.type === "url";
              return (
                <div
                  key={field.key}
                  className={
                    field.half ? "space-y-2" : spanFull ? "space-y-2 sm:col-span-2" : "space-y-2"
                  }
                >
                  <Label htmlFor={`f-${field.key}`}>
                    {field.label}
                    {field.required ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={`f-${field.key}`}
                      rows={3}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      id={`f-${field.key}`}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                  )}
                  {errors[field.key] ? (
                    <p className="text-xs text-destructive">{errors[field.key]}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {section.skills ? (
            <div className="space-y-2">
              <Label htmlFor="skill-draft">{section.skillsLabel ?? "Skills"}</Label>
              <div className="flex gap-2">
                <Input
                  id="skill-draft"
                  placeholder="Type a skill and press Enter"
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addSkill(skillDraft);
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={() => addSkill(skillDraft)}>
                  Add
                </Button>
              </div>
              {skills.length ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                      {skill}
                      <button
                        type="button"
                        aria-label={`Remove ${skill}`}
                        className="rounded-sm p-0.5 hover:bg-background/60"
                        onClick={() => setSkills((prev) => prev.filter((s) => s !== skill))}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
              {errors["skills"] ? (
                <p className="text-xs text-destructive">{errors["skills"]}</p>
              ) : null}
            </div>
          ) : null}

          {section.bullets ? (
            <div className="space-y-3 rounded-lg border border-evidence/30 bg-evidence/5 p-4">
              <div>
                <Label>{section.bulletsLabel ?? "Bullets"}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{section.bulletsHint}</p>
              </div>
              <div className="space-y-2">
                {bullets.map((bullet, index) => (
                  <div key={bullet.id ?? `new-${index}`} className="flex items-start gap-2">
                    <Textarea
                      rows={2}
                      aria-label={`Bullet ${index + 1}`}
                      placeholder="Delivered X, resulting in Y."
                      value={bullet.content}
                      onChange={(e) =>
                        setBullets((prev) =>
                          prev.map((b, i) => (i === index ? { ...b, content: e.target.value } : b)),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove bullet ${index + 1}`}
                      onClick={() => {
                        if (bullet.id) setRemovedBulletIds((prev) => [...prev, bullet.id as string]);
                        setBullets((prev) => prev.filter((_, i) => i !== index));
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBullets((prev) => [...prev, { id: null, content: "" }])}
              >
                <Plus className="size-4" aria-hidden />
                Add bullet
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={loadExample}>
            <Sparkles className="size-4" aria-hidden />
            Load example copy
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save {section.singular}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
