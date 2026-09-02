-- structured source items
CREATE TABLE public.resume_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_resume_id uuid NOT NULL REFERENCES public.master_resumes(id) ON DELETE CASCADE,
  section text NOT NULL,
  title text,
  organization text,
  role text,
  location text,
  start_date text,
  end_date text,
  url text,
  description text,
  skills text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_items TO authenticated;
GRANT ALL ON public.resume_items TO service_role;
ALTER TABLE public.resume_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resume_items" ON public.resume_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX resume_items_master_section_idx ON public.resume_items (master_resume_id, section, sort_order);

CREATE TABLE public.resume_item_bullets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_item_id uuid NOT NULL REFERENCES public.resume_items(id) ON DELETE CASCADE,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_item_bullets TO authenticated;
GRANT ALL ON public.resume_item_bullets TO service_role;
ALTER TABLE public.resume_item_bullets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resume_item_bullets" ON public.resume_item_bullets FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX resume_item_bullets_item_idx ON public.resume_item_bullets (resume_item_id, sort_order);

CREATE TRIGGER resume_items_updated_at BEFORE UPDATE ON public.resume_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER resume_item_bullets_updated_at BEFORE UPDATE ON public.resume_item_bullets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- provenance columns on evidence
ALTER TABLE public.resume_evidence
  ADD COLUMN resume_item_id uuid REFERENCES public.resume_items(id) ON DELETE CASCADE,
  ADD COLUMN resume_item_bullet_id uuid REFERENCES public.resume_item_bullets(id) ON DELETE CASCADE,
  ADD COLUMN evidence_kind text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX resume_evidence_item_unique ON public.resume_evidence (resume_item_id)
  WHERE resume_item_id IS NOT NULL AND resume_item_bullet_id IS NULL;
CREATE UNIQUE INDEX resume_evidence_bullet_unique ON public.resume_evidence (resume_item_bullet_id)
  WHERE resume_item_bullet_id IS NOT NULL;
CREATE UNIQUE INDEX resume_evidence_summary_unique ON public.resume_evidence (master_resume_id)
  WHERE evidence_kind = 'summary';

-- keep evidence in sync with resume items
CREATE OR REPLACE FUNCTION public.sync_resume_item_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
BEGIN
  v_content := COALESCE(
    NULLIF(btrim(COALESCE(NEW.description, '')), ''),
    NULLIF(concat_ws(' — ', NULLIF(NEW.role, ''), NULLIF(NEW.organization, ''), NULLIF(NEW.title, '')), ''),
    NULLIF(NEW.title, ''),
    NEW.section
  );

  UPDATE public.resume_evidence SET
    category = NEW.section,
    title = NEW.title,
    organization = NEW.organization,
    role = NEW.role,
    location = NEW.location,
    start_date = NEW.start_date,
    end_date = NEW.end_date,
    content = v_content,
    skills = NEW.skills,
    sort_order = NEW.sort_order,
    source_reference = 'resume_items:' || NEW.id,
    updated_at = now()
  WHERE resume_item_id = NEW.id AND resume_item_bullet_id IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.resume_evidence (
      user_id, master_resume_id, category, title, organization, role, location,
      start_date, end_date, content, skills, sort_order, source_reference,
      resume_item_id, evidence_kind
    ) VALUES (
      NEW.user_id, NEW.master_resume_id, NEW.section, NEW.title, NEW.organization, NEW.role,
      NEW.location, NEW.start_date, NEW.end_date, v_content, NEW.skills, NEW.sort_order,
      'resume_items:' || NEW.id, NEW.id, 'item'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER resume_items_sync_evidence
  AFTER INSERT OR UPDATE ON public.resume_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_resume_item_evidence();

-- keep evidence in sync with bullets
CREATE OR REPLACE FUNCTION public.sync_resume_bullet_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.resume_items;
BEGIN
  SELECT * INTO v_item FROM public.resume_items WHERE id = NEW.resume_item_id;

  UPDATE public.resume_evidence SET
    category = v_item.section,
    title = v_item.title,
    organization = v_item.organization,
    role = v_item.role,
    location = v_item.location,
    start_date = v_item.start_date,
    end_date = v_item.end_date,
    content = NEW.content,
    sort_order = NEW.sort_order,
    source_reference = 'resume_item_bullets:' || NEW.id,
    updated_at = now()
  WHERE resume_item_bullet_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.resume_evidence (
      user_id, master_resume_id, category, title, organization, role, location,
      start_date, end_date, content, sort_order, source_reference,
      resume_item_id, resume_item_bullet_id, evidence_kind
    ) VALUES (
      NEW.user_id, v_item.master_resume_id, v_item.section, v_item.title, v_item.organization,
      v_item.role, v_item.location, v_item.start_date, v_item.end_date, NEW.content,
      NEW.sort_order, 'resume_item_bullets:' || NEW.id, v_item.id, NEW.id, 'bullet'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER resume_item_bullets_sync_evidence
  AFTER INSERT OR UPDATE ON public.resume_item_bullets
  FOR EACH ROW EXECUTE FUNCTION public.sync_resume_bullet_evidence();

-- keep bullet evidence headers aligned when the parent item changes
CREATE OR REPLACE FUNCTION public.sync_resume_item_bullet_headers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.resume_evidence SET
    category = NEW.section,
    title = NEW.title,
    organization = NEW.organization,
    role = NEW.role,
    location = NEW.location,
    start_date = NEW.start_date,
    end_date = NEW.end_date,
    updated_at = now()
  WHERE resume_item_id = NEW.id AND resume_item_bullet_id IS NOT NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER resume_items_sync_bullet_headers
  AFTER UPDATE ON public.resume_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_resume_item_bullet_headers();

-- keep evidence in sync with the professional summary
CREATE OR REPLACE FUNCTION public.sync_master_summary_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.summary, '')), '') IS NULL THEN
    DELETE FROM public.resume_evidence
      WHERE master_resume_id = NEW.id AND evidence_kind = 'summary';
    RETURN NEW;
  END IF;

  UPDATE public.resume_evidence SET
    content = NEW.summary,
    source_reference = 'master_resumes:' || NEW.id,
    updated_at = now()
  WHERE master_resume_id = NEW.id AND evidence_kind = 'summary';

  IF NOT FOUND THEN
    INSERT INTO public.resume_evidence (
      user_id, master_resume_id, category, title, content, source_reference, sort_order, evidence_kind
    ) VALUES (
      NEW.user_id, NEW.id, 'summary', 'Professional summary', NEW.summary,
      'master_resumes:' || NEW.id, 0, 'summary'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER master_resumes_sync_summary_evidence
  AFTER INSERT OR UPDATE OF summary ON public.master_resumes
  FOR EACH ROW EXECUTE FUNCTION public.sync_master_summary_evidence();

REVOKE ALL ON FUNCTION public.sync_resume_item_evidence() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_resume_bullet_evidence() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_resume_item_bullet_headers() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_master_summary_evidence() FROM anon, authenticated;