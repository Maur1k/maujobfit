ALTER TABLE public.resume_imports
  ADD COLUMN IF NOT EXISTS parsed_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parsed_summary text,
  ADD COLUMN IF NOT EXISTS summary_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS page_count integer;

ALTER TABLE public.resume_items
  ADD COLUMN IF NOT EXISTS resume_import_id uuid REFERENCES public.resume_imports(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.resume_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_import_id uuid NOT NULL REFERENCES public.resume_imports(id) ON DELETE CASCADE,
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
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  merged_resume_item_id uuid REFERENCES public.resume_items(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_import_items TO authenticated;
GRANT ALL ON public.resume_import_items TO service_role;

ALTER TABLE public.resume_import_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own resume_import_items" ON public.resume_import_items;
CREATE POLICY "own resume_import_items" ON public.resume_import_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS resume_import_items_import_idx
  ON public.resume_import_items (resume_import_id, sort_order);

DROP TRIGGER IF EXISTS resume_import_items_set_updated_at ON public.resume_import_items;
CREATE TRIGGER resume_import_items_set_updated_at
  BEFORE UPDATE ON public.resume_import_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    resume_import_id = NEW.resume_import_id,
    updated_at = now()
  WHERE resume_item_id = NEW.id AND resume_item_bullet_id IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.resume_evidence (
      user_id, master_resume_id, category, title, organization, role, location,
      start_date, end_date, content, skills, sort_order, source_reference,
      resume_item_id, evidence_kind, resume_import_id
    ) VALUES (
      NEW.user_id, NEW.master_resume_id, NEW.section, NEW.title, NEW.organization, NEW.role,
      NEW.location, NEW.start_date, NEW.end_date, v_content, NEW.skills, NEW.sort_order,
      'resume_items:' || NEW.id, NEW.id, 'item', NEW.resume_import_id
    );
  END IF;

  RETURN NEW;
END;
$$;

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
    resume_import_id = v_item.resume_import_id,
    updated_at = now()
  WHERE resume_item_bullet_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.resume_evidence (
      user_id, master_resume_id, category, title, organization, role, location,
      start_date, end_date, content, sort_order, source_reference,
      resume_item_id, resume_item_bullet_id, evidence_kind, resume_import_id
    ) VALUES (
      NEW.user_id, v_item.master_resume_id, v_item.section, v_item.title, v_item.organization,
      v_item.role, v_item.location, v_item.start_date, v_item.end_date, NEW.content,
      NEW.sort_order, 'resume_item_bullets:' || NEW.id, v_item.id, NEW.id, 'bullet', v_item.resume_import_id
    );
  END IF;

  RETURN NEW;
END;
$$;