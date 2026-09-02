ALTER TABLE public.tailored_resume_items
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS source_text text;

ALTER TABLE public.tailored_resumes
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS tailored_resumes_job_idx ON public.tailored_resumes (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tailored_resume_items_resume_idx ON public.tailored_resume_items (tailored_resume_id, sort_order);