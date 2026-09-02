export type ImportSection =
  | "experience"
  | "project"
  | "skill"
  | "education"
  | "certification"
  | "link";

export const IMPORT_SECTIONS: ImportSection[] = [
  "experience",
  "project",
  "skill",
  "education",
  "certification",
  "link",
];

export type ImportBullet = {
  id: string;
  content: string;
  status: "pending" | "accepted" | "skipped";
};

export type ImportItem = {
  id: string;
  resume_import_id: string;
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
  bullets: ImportBullet[];
  status: string;
  merged_resume_item_id: string | null;
  sort_order: number;
};

export type ImportProfile = {
  full_name?: string | null;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  portfolio_url?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
};

export type ResumeImportRow = {
  id: string;
  file_name: string;
  file_path: string | null;
  file_size: number | null;
  status: string;
  error_message: string | null;
  raw_text: string | null;
  parsed_profile: ImportProfile | null;
  parsed_summary: string | null;
  summary_status: string;
  profile_status: string;
  page_count: number | null;
  parsed_at: string | null;
  created_at: string;
};

export const PROFILE_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "headline", label: "Headline" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "portfolio_url", label: "Portfolio" },
  { key: "github_url", label: "GitHub" },
  { key: "linkedin_url", label: "LinkedIn" },
] as const;

export { MAX_IMPORT_BYTES } from "./pdf-validation";

export function normaliseBullets(value: unknown): ImportBullet[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      if (typeof raw === "string") {
        return { id: `b${index}`, content: raw, status: "accepted" as const };
      }
      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const content = typeof obj["content"] === "string" ? obj["content"] : "";
        const status = obj["status"];
        return {
          id: typeof obj["id"] === "string" ? obj["id"] : `b${index}`,
          content,
          status:
            status === "skipped" || status === "pending" || status === "accepted"
              ? status
              : ("accepted" as const),
        };
      }
      return null;
    })
    .filter((b): b is ImportBullet => !!b && b.content.trim().length > 0);
}

export function itemHeadline(item: ImportItem) {
  return (
    [item.role, item.title].filter(Boolean).join(" · ") ||
    item.organization ||
    "Untitled entry"
  );
}

export function importStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Uploading";
    case "parsing":
      return "Reading PDF";
    case "ready":
      return "Ready to review";
    case "merged":
      return "Merged";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
