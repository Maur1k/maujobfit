import type { CompositionPriority } from "@/lib/composition";
import type { TailoringSettings } from "@/lib/tailoring-settings";

export const TAILORED_SECTIONS = [
  "summary",
  "experience",
  "project",
  "skill",
  "education",
  "certification",
] as const;
export type TailoredSection = (typeof TAILORED_SECTIONS)[number];

/** Presentation order used when composing and rendering a tailored version. */
export const TAILORED_SECTION_ORDER = TAILORED_SECTIONS;

export const tailoredSectionLabel: Record<string, string> = {
  summary: "Targeted summary",
  experience: "Experience",
  project: "Projects",
  skill: "Skills",
  education: "Education",
  certification: "Certifications",
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
  settings?: Partial<TailoringSettings> | null;
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
  priority?: CompositionPriority | null;
  priority_rationale?: string | null;
};

export type TailoredSourceRow = {
  id: string;
  tailored_resume_item_id: string;
  resume_evidence_id: string;
  support_type: string;
  confidence: number | null;
  excerpt: string | null;
};

export const TAILORED_ITEM_COLUMNS =
  "id, section, heading, statement, sort_order, is_evidence_backed, validation_status, rationale, confidence, source_text, priority, priority_rationale";

export const TAILORED_RESUME_COLUMNS =
  "id, job_id, master_resume_id, title, status, generation_status, error_message, version, match_score, evidence_coverage, notes, created_at, settings";
