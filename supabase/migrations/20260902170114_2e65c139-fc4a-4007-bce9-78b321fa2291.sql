CREATE TABLE public.tailored_resume_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_id UUID NOT NULL REFERENCES public.tailored_resumes ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  snapshot_index INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  supported_only BOOLEAN NOT NULL DEFAULT false,
  item_count INTEGER NOT NULL DEFAULT 0,
  supported_count INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  export_id UUID REFERENCES public.exports ON DELETE SET NULL,
  export_format TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tailored_resume_versions TO authenticated;
GRANT ALL ON public.tailored_resume_versions TO service_role;
ALTER TABLE public.tailored_resume_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tailored_resume_versions" ON public.tailored_resume_versions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX tailored_resume_versions_resume_idx ON public.tailored_resume_versions (tailored_resume_id, created_at DESC);

CREATE TABLE public.ats_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_id UUID NOT NULL REFERENCES public.tailored_resumes ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs ON DELETE SET NULL,
  overall_score NUMERIC,
  keyword_score NUMERIC,
  requirement_score NUMERIC,
  readability_score NUMERIC,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}',
  related_keywords TEXT[] NOT NULL DEFAULT '{}',
  missing_keywords TEXT[] NOT NULL DEFAULT '{}',
  requirement_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  readability JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysed_items INTEGER NOT NULL DEFAULT 0,
  ai_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_analyses TO authenticated;
GRANT ALL ON public.ats_analyses TO service_role;
ALTER TABLE public.ats_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ats_analyses" ON public.ats_analyses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ats_analyses_resume_idx ON public.ats_analyses (tailored_resume_id, created_at DESC);

CREATE TABLE public.cover_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_id UUID NOT NULL REFERENCES public.tailored_resumes ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  recipient TEXT,
  greeting TEXT NOT NULL DEFAULT 'Dear Hiring Manager,',
  opening TEXT NOT NULL DEFAULT '',
  paragraphs JSONB NOT NULL DEFAULT '[]'::jsonb,
  closing TEXT NOT NULL DEFAULT '',
  signoff TEXT NOT NULL DEFAULT 'Sincerely,',
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cover_letters TO authenticated;
GRANT ALL ON public.cover_letters TO service_role;
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cover_letters" ON public.cover_letters FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER cover_letters_updated_at BEFORE UPDATE ON public.cover_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX cover_letters_resume_idx ON public.cover_letters (tailored_resume_id, created_at DESC);