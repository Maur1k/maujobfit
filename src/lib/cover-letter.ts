export type CoverLetterParagraph = {
  id: string;
  text: string;
  evidence_ids: string[];
  status: string;
  rationale: string;
  unsupported_spans: string[];
};

export type CoverLetterRow = {
  id: string;
  tailored_resume_id: string;
  job_id: string | null;
  status: string;
  recipient: string | null;
  greeting: string;
  opening: string;
  paragraphs: CoverLetterParagraph[];
  closing: string;
  signoff: string;
  validation_status: string;
  validation_notes: { paragraph_id: string; message: string }[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const coverLetterStatusLabel: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  exported: "Exported",
};

/** Plain-text body used for both the PDF and the on-screen preview. */
export function coverLetterBody(letter: {
  opening: string;
  paragraphs: { text: string }[];
  closing: string;
}) {
  return [letter.opening, ...letter.paragraphs.map((row) => row.text), letter.closing]
    .map((value) => value.trim())
    .filter(Boolean);
}
