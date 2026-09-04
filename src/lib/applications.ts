/**
 * Application tracking domain model.
 *
 * A `job_applications` row records that a specific tailored resume VERSION (and
 * optionally the cover letter generated from it) was sent somewhere on a date.
 * It never mutates the tailored resume, the cover letter or the master resume —
 * it only references them, so the audit trail stays intact.
 */

export const APPLICATION_STATUSES = [
  "sent",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const applicationStatusLabel: Record<string, string> = {
  sent: "Sent",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const applicationStatusBadgeClass: Record<string, string> = {
  sent: "border-border bg-secondary/60 text-foreground",
  interview: "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/10 text-foreground",
  offer: "border-[hsl(var(--evidence))]/60 bg-[hsl(var(--evidence))]/20 text-foreground",
  rejected: "border-destructive/40 bg-destructive/5 text-foreground",
  withdrawn: "border-border bg-muted text-muted-foreground",
};

export const APPLICATION_CHANNELS = [
  "email",
  "company_site",
  "linkedin",
  "job_board",
  "referral",
  "other",
] as const;
export type ApplicationChannel = (typeof APPLICATION_CHANNELS)[number];

export const applicationChannelLabel: Record<string, string> = {
  email: "Email",
  company_site: "Company website",
  linkedin: "LinkedIn",
  job_board: "Job board",
  referral: "Referral",
  other: "Other",
};

export type ApplicationRow = {
  id: string;
  job_id: string | null;
  tailored_resume_id: string | null;
  tailored_resume_version: number | null;
  cover_letter_id: string | null;
  job_title: string;
  company: string | null;
  sent_to: string | null;
  channel: string;
  status: string;
  applied_at: string;
  package_file_name: string | null;
  notes: string | null
  created_at: string;
  updated_at: string;
};

export const APPLICATION_COLUMNS =
  "id, job_id, tailored_resume_id, tailored_resume_version, cover_letter_id, job_title, company, sent_to, channel, status, applied_at, package_file_name, notes, created_at, updated_at";

/** yyyy-MM-dd in the viewer's local timezone, for <input type="date"> values. */
export function toDateInputValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatAppliedAt(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
