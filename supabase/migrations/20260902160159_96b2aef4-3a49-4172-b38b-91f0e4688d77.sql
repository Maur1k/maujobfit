ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS master_resume_id uuid REFERENCES public.master_resumes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS evidence_excerpt text;

CREATE INDEX IF NOT EXISTS match_results_job_idx ON public.match_results (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS match_results_requirement_idx ON public.match_results (job_requirement_id);