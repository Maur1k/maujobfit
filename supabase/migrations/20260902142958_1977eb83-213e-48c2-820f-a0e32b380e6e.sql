-- shared helpers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  headline TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  portfolio_url TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- master resumes
CREATE TABLE public.master_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Master Resume',
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_resumes TO authenticated;
GRANT ALL ON public.master_resumes TO service_role;
ALTER TABLE public.master_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own master_resumes" ON public.master_resumes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER master_resumes_updated_at BEFORE UPDATE ON public.master_resumes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX master_resumes_user_idx ON public.master_resumes(user_id);

-- resume imports
CREATE TABLE public.resume_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  master_resume_id UUID REFERENCES public.master_resumes ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  raw_text TEXT,
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_imports TO authenticated;
GRANT ALL ON public.resume_imports TO service_role;
ALTER TABLE public.resume_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resume_imports" ON public.resume_imports FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER resume_imports_updated_at BEFORE UPDATE ON public.resume_imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- resume evidence
CREATE TABLE public.resume_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  master_resume_id UUID NOT NULL REFERENCES public.master_resumes ON DELETE CASCADE,
  resume_import_id UUID REFERENCES public.resume_imports ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT,
  organization TEXT,
  role TEXT,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  content TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_reference TEXT,
  source_page INTEGER,
  verified BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_evidence TO authenticated;
GRANT ALL ON public.resume_evidence TO service_role;
ALTER TABLE public.resume_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resume_evidence" ON public.resume_evidence FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER resume_evidence_updated_at BEFORE UPDATE ON public.resume_evidence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX resume_evidence_master_idx ON public.resume_evidence(master_resume_id);

-- jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  employment_type TEXT,
  source_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'saved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.jobs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- job requirements
CREATE TABLE public.job_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs ON DELETE CASCADE,
  requirement TEXT NOT NULL,
  requirement_type TEXT,
  importance TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_requirements TO authenticated;
GRANT ALL ON public.job_requirements TO service_role;
ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own job_requirements" ON public.job_requirements FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- match results
CREATE TABLE public.match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs ON DELETE CASCADE,
  job_requirement_id UUID REFERENCES public.job_requirements ON DELETE CASCADE,
  resume_evidence_id UUID REFERENCES public.resume_evidence ON DELETE CASCADE,
  score NUMERIC(5,2),
  coverage TEXT,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_results TO authenticated;
GRANT ALL ON public.match_results TO service_role;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own match_results" ON public.match_results FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- tailored resumes
CREATE TABLE public.tailored_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs ON DELETE SET NULL,
  master_resume_id UUID REFERENCES public.master_resumes ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Tailored Resume',
  status TEXT NOT NULL DEFAULT 'draft',
  match_score NUMERIC(5,2),
  evidence_coverage NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tailored_resumes TO authenticated;
GRANT ALL ON public.tailored_resumes TO service_role;
ALTER TABLE public.tailored_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tailored_resumes" ON public.tailored_resumes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER tailored_resumes_updated_at BEFORE UPDATE ON public.tailored_resumes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tailored resume items
CREATE TABLE public.tailored_resume_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_id UUID NOT NULL REFERENCES public.tailored_resumes ON DELETE CASCADE,
  section TEXT NOT NULL,
  heading TEXT,
  statement TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_evidence_backed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tailored_resume_items TO authenticated;
GRANT ALL ON public.tailored_resume_items TO service_role;
ALTER TABLE public.tailored_resume_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tailored_resume_items" ON public.tailored_resume_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER tailored_resume_items_updated_at BEFORE UPDATE ON public.tailored_resume_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tailored resume item sources
CREATE TABLE public.tailored_resume_item_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_item_id UUID NOT NULL REFERENCES public.tailored_resume_items ON DELETE CASCADE,
  resume_evidence_id UUID NOT NULL REFERENCES public.resume_evidence ON DELETE CASCADE,
  support_type TEXT NOT NULL DEFAULT 'primary',
  confidence NUMERIC(5,2),
  excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tailored_resume_item_id, resume_evidence_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tailored_resume_item_sources TO authenticated;
GRANT ALL ON public.tailored_resume_item_sources TO service_role;
ALTER TABLE public.tailored_resume_item_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tailored_resume_item_sources" ON public.tailored_resume_item_sources FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- validation results
CREATE TABLE public.validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_id UUID NOT NULL REFERENCES public.tailored_resumes ON DELETE CASCADE,
  tailored_resume_item_id UUID REFERENCES public.tailored_resume_items ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  passed BOOLEAN NOT NULL DEFAULT true,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_results TO authenticated;
GRANT ALL ON public.validation_results TO service_role;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own validation_results" ON public.validation_results FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- exports
CREATE TABLE public.exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tailored_resume_id UUID REFERENCES public.tailored_resumes ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'pdf',
  file_path TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exports TO authenticated;
GRANT ALL ON public.exports TO service_role;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exports" ON public.exports FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER exports_updated_at BEFORE UPDATE ON public.exports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();