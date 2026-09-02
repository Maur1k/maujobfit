export type ResumeBullet = {
  id: string;
  content: string;
  sort_order: number;
};

export type ResumeItem = {
  id: string;
  section: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  description: string | null;
  skills: string[];
  sort_order: number;
  resume_item_bullets: ResumeBullet[];
};
