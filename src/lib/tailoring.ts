export const TAILORED_SECTIONS = ["summary", "experience", "project", "skill"] as const;
export type TailoredSection = (typeof TAILORED_SECTIONS)[number];

export const tailoredSectionLabel: Record<string, string> = {
  summary: "Targeted summary",
  experience: "Experience",
  project: "Projects",
  skill: "Skills",
};

export type TailoredResumeRow = {
  id: string;
  job_id: string | null;
  master_resume_id: string | null;
  title: string;
  status: string;
  generation_status: string;
  error_message: string | null;
  version: number;
  match_score: number | null;
  evidence_coverage: number | null;
  notes: string | null;
  created_at: string;
};

export type TailoredItemRow = {
  id: string;
  section: string;
  heading: string | null;
  statement: string;
  sort_order: number;
  is_evidence_backed: boolean;
  validation_status: string;
  rationale: string | null;
  confidence: number | null;
  source_text: string | null;
};

export type TailoredSourceRow = {
  id: string;
  tailored_resume_item_id: string;
  resume_evidence_id: string;
  support_type: string;
  confidence: number | null;
  excerpt: string | null;
};
