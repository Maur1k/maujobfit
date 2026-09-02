CREATE TYPE public.composition_priority AS ENUM ('high', 'supporting', 'low', 'exclude');

CREATE TABLE public.job_content_priorities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  master_resume_id uuid NOT NULL REFERENCES public.master_resumes(id) ON DELETE CASCADE,
  resume_item_id uuid REFERENCES public.resume_items(id) ON DELETE CASCADE,
  resume_evidence_id uuid REFERENCES public.resume_evidence(id) ON DELETE CASCADE,
  section text NOT NULL,
  label text NOT NULL,
  priority public.composition_priority NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  rationale text NOT NULL,
  matched_terms text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_content_priorities TO authenticated;
GRANT ALL ON public.job_content_priorities TO service_role;
ALTER TABLE public.job_content_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own job content priorities"
  ON public.job_content_priorities FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX job_content_priorities_job_idx ON public.job_content_priorities (job_id, user_id);
CREATE INDEX job_content_priorities_item_idx ON public.job_content_priorities (resume_item_id);

CREATE TRIGGER job_content_priorities_set_updated_at
  BEFORE UPDATE ON public.job_content_priorities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_tailoring_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  resume_length text NOT NULL DEFAULT 'two_page',
  tailoring_level text NOT NULL DEFAULT 'balanced',
  project_inclusion text NOT NULL DEFAULT 'relevant_supporting',
  skills_scope text NOT NULL DEFAULT 'relevant_supporting',
  include_summary boolean NOT NULL DEFAULT true,
  include_experience boolean NOT NULL DEFAULT true,
  include_projects boolean NOT NULL DEFAULT true,
  include_skills boolean NOT NULL DEFAULT true,
  include_education boolean NOT NULL DEFAULT true,
  include_certifications boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_tailoring_settings TO authenticated;
GRANT ALL ON public.job_tailoring_settings TO service_role;
ALTER TABLE public.job_tailoring_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own job tailoring settings"
  ON public.job_tailoring_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER job_tailoring_settings_set_updated_at
  BEFORE UPDATE ON public.job_tailoring_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tailored_resumes
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tailored_resume_items
  ADD COLUMN priority public.composition_priority NOT NULL DEFAULT 'supporting',
  ADD COLUMN priority_rationale text;