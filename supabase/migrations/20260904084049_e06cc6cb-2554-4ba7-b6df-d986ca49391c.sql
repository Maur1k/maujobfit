CREATE TABLE public.job_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  tailored_resume_id uuid REFERENCES public.tailored_resumes(id) ON DELETE SET NULL,
  tailored_resume_version integer,
  cover_letter_id uuid REFERENCES public.cover_letters(id) ON DELETE SET NULL,
  job_title text NOT NULL,
  company text,
  sent_to text,
  channel text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'sent',
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  package_file_name text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own job applications"
  ON public.job_applications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX job_applications_user_applied_at_idx ON public.job_applications (user_id, applied_at DESC);
CREATE INDEX job_applications_job_idx ON public.job_applications (job_id);

CREATE TRIGGER job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();