ALTER TABLE public.validation_results
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS evidence_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_excerpts TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unsupported_spans TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS issues TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validator TEXT NOT NULL DEFAULT 'deterministic',
  ADD COLUMN IF NOT EXISTS run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

ALTER TABLE public.validation_results
  DROP CONSTRAINT IF EXISTS validation_results_status_check;
ALTER TABLE public.validation_results
  ADD CONSTRAINT validation_results_status_check
  CHECK (status IN ('supported', 'partially_supported', 'unsupported', 'needs_review'));

CREATE INDEX IF NOT EXISTS validation_results_resume_idx
  ON public.validation_results (tailored_resume_id, tailored_resume_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_results TO authenticated;
GRANT ALL ON public.validation_results TO service_role;