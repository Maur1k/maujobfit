DO $$ BEGIN
  CREATE TYPE public.skill_relevance AS ENUM ('exact','related','listed_only','not_relevant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.job_skill_relevance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  master_resume_id uuid NOT NULL REFERENCES public.master_resumes(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  canonical_skill text NOT NULL,
  relevance public.skill_relevance NOT NULL,
  rationale text NOT NULL DEFAULT '',
  matched_requirement_ids uuid[] NOT NULL DEFAULT '{}',
  resume_evidence_ids uuid[] NOT NULL DEFAULT '{}',
  resume_item_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, canonical_skill)
);

CREATE INDEX job_skill_relevance_job_idx ON public.job_skill_relevance (job_id, relevance);
CREATE INDEX job_skill_relevance_user_idx ON public.job_skill_relevance (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_skill_relevance TO authenticated;
GRANT ALL ON public.job_skill_relevance TO service_role;

ALTER TABLE public.job_skill_relevance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own job skill relevance"
  ON public.job_skill_relevance FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER job_skill_relevance_updated_at
  BEFORE UPDATE ON public.job_skill_relevance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();