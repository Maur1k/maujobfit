import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { saveTailoringSettings } from "@/lib/composition.functions";
import {
  DEFAULT_TAILORING_SETTINGS,
  normaliseSettings,
  PAPER_SIZE_OPTIONS,
  PROJECT_INCLUSION_OPTIONS,
  RESUME_LENGTH_OPTIONS,
  SECTION_TOGGLES,
  SKILLS_SCOPE_OPTIONS,
  TAILORING_LEVEL_OPTIONS,
  type TailoringSettings,
} from "@/lib/tailoring-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function tailoringSettingsQueryKey(jobId: string, userId?: string) {
  return ["job-tailoring-settings", jobId, userId];
}

type Option = { value: string; label: string; description: string };

function ChoiceGroup({
  id,
  title,
  hint,
  options,
  value,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="rounded-lg border bg-background p-4">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <p className="mb-3 text-xs text-muted-foreground">
        {hint} Pick one — the choices are mutually exclusive.
      </p>
      <RadioGroup value={value} onValueChange={onChange} className="gap-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-start gap-3">
            <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-1" />
            <Label htmlFor={`${id}-${option.value}`} className="grid gap-0.5 font-normal">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

export function TailoringSettingsCard({
  jobId,
  onSaved,
}: {
  jobId: string;
  onSaved?: (settings: TailoringSettings) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = tailoringSettingsQueryKey(jobId, user?.id);
  const [draft, setDraft] = useState<TailoringSettings>(DEFAULT_TAILORING_SETTINGS);
  const [saving, setSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_tailoring_settings")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return normaliseSettings(data);
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveTailoringSettings({ data: { jobId, settings: draft } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      onSaved?.(draft);
      toast.success("Tailoring settings saved for this job.");
    } catch {
      toast.error("We couldn't save the tailoring settings. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(settingsQuery.data ?? DEFAULT_TAILORING_SETTINGS);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
              Tailoring settings
            </CardTitle>
            <CardDescription>
              These choices drive composition only — how much of your Master Resume is presented for
              this job and in what order. Nothing here edits, reorders or deletes master-resume
              records, and saved versions keep the settings that produced them.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {dirty ? "Save settings" : "Saved"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsQuery.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <ChoiceGroup
                id="resume-length"
                title="Resume length"
                hint="Sets the space budget."
                options={RESUME_LENGTH_OPTIONS}
                value={draft.resume_length}
                onChange={(value) =>
                  setDraft({ ...draft, resume_length: value as TailoringSettings["resume_length"] })
                }
              />
              <ChoiceGroup
                id="tailoring-level"
                title="Tailoring level"
                hint="How hard the composition leans into this posting."
                options={TAILORING_LEVEL_OPTIONS}
                value={draft.tailoring_level}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    tailoring_level: value as TailoringSettings["tailoring_level"],
                  })
                }
              />
              <ChoiceGroup
                id="project-inclusion"
                title="Project inclusion"
                hint="Which projects reach the tailored version."
                options={PROJECT_INCLUSION_OPTIONS}
                value={draft.project_inclusion}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    project_inclusion: value as TailoringSettings["project_inclusion"],
                  })
                }
              />
              <ChoiceGroup
                id="skills-scope"
                title="Skills"
                hint="Technical Skills is never reduced to exact job terms; this sets how wide it goes."
                options={SKILLS_SCOPE_OPTIONS}
                value={draft.skills_scope}
                onChange={(value) =>
                  setDraft({ ...draft, skills_scope: value as TailoringSettings["skills_scope"] })
                }
              />
            </div>

            <fieldset className="rounded-lg border bg-secondary/30 p-4">
              <legend className="px-1 text-sm font-medium">Sections</legend>
              <p className="mb-3 text-xs text-muted-foreground">
                All sections are retained by default. Turning one off affects this job's tailored
                versions only.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SECTION_TOGGLES.map((toggle) => (
                  <div key={toggle.key} className="flex items-center gap-2">
                    <Switch
                      id={`section-${toggle.key}`}
                      checked={draft[toggle.key] as boolean}
                      onCheckedChange={(checked) => setDraft({ ...draft, [toggle.key]: checked })}
                    />
                    <Label htmlFor={`section-${toggle.key}`} className="text-sm font-normal">
                      {toggle.label}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          </>
        )}
      </CardContent>
    </Card>
  );
}
