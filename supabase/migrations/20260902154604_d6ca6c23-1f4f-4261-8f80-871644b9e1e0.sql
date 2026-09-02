ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS seniority text,
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.job_requirements
  ADD COLUMN IF NOT EXISTS canonical_skill text,
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS related_skills text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON public.jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_requirements_job_idx ON public.job_requirements (job_id, sort_order);