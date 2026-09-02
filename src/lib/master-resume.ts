export type SectionKey =
  | "summary"
  | "experience"
  | "project"
  | "skill"
  | "education"
  | "certification"
  | "link";

export type FieldKey =
  | "title"
  | "organization"
  | "role"
  | "location"
  | "start_date"
  | "end_date"
  | "url"
  | "description";

export type FieldConfig = {
  key: FieldKey;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "textarea" | "url";
  half?: boolean;
};

export type SectionConfig = {
  key: Exclude<SectionKey, "summary">;
  label: string;
  singular: string;
  blurb: string;
  fields: FieldConfig[];
  bullets: boolean;
  bulletsLabel?: string;
  bulletsHint?: string;
  skills: boolean;
  skillsLabel?: string;
  skillsRequired?: boolean;
  example: Partial<Record<FieldKey, string>> & { skills?: string[]; bullets?: string[] };
};

const dateFields: FieldConfig[] = [
  { key: "start_date", label: "Start", placeholder: "May 2026", half: true },
  { key: "end_date", label: "End", placeholder: "August 2026 or Present", half: true },
];

export const SECTIONS: SectionConfig[] = [
  {
    key: "experience",
    label: "Experience",
    singular: "role",
    blurb:
      "Employment history. Each bullet becomes its own evidence record so a tailored resume can cite one accomplishment without dragging in the rest.",
    fields: [
      { key: "role", label: "Job title", placeholder: "Software Developer", required: true },
      { key: "organization", label: "Company", placeholder: "When in Baguio, Inc.", required: true },
      { key: "location", label: "Location", placeholder: "Baguio City, PH" },
      ...dateFields,
      {
        key: "description",
        label: "Context",
        type: "textarea",
        placeholder: "One or two lines about scope, team size or ownership.",
      },
    ],
    bullets: true,
    bulletsLabel: "Accomplishment bullets",
    bulletsHint: "One measurable outcome per line. Each line is stored as separate evidence.",
    skills: true,
    skillsLabel: "Technologies used",
    example: {
      role: "Software Developer",
      organization: "When in Baguio, Inc.",
      start_date: "May 2026",
      end_date: "August 2026",
      skills: ["Node.js", "Express", "MySQL", "React"],
      bullets: [
        "Maintained and enhanced the production operations platform, keeping critical business workflows reliable.",
        "Centralized data from two separate database sources into a unified dashboard.",
        "Supported deployment of a production mobile app serving 60,000+ existing users.",
      ],
    },
  },
  {
    key: "project",
    label: "Projects",
    singular: "project",
    blurb: "Shipped work you can speak to in detail, with the stack and your specific contribution.",
    fields: [
      {
        key: "title",
        label: "Project name",
        placeholder: "WIB V2 — Operations & Dispatch Platform",
        required: true,
      },
      { key: "organization", label: "Context", placeholder: "Client, employer or personal" },
      { key: "url", label: "Link", type: "url", placeholder: "https://…" },
      ...dateFields,
      {
        key: "description",
        label: "What it is",
        type: "textarea",
        placeholder: "A sentence describing the product and your role on it.",
      },
    ],
    bullets: true,
    bulletsLabel: "Contribution bullets",
    bulletsHint: "What you built and what it achieved. One claim per line.",
    skills: true,
    skillsLabel: "Stack",
    example: {
      title: "WIB V2 — Operations & Dispatch Platform",
      skills: ["Node.js", "React", "MySQL", "Firebase"],
      bullets: [
        "Rebuilt a legacy Yii/PHP operations platform on Node.js, React and MySQL.",
        "Optimized MySQL retrieval with keyset pagination, reaching sub-100ms responses on high-volume queries.",
      ],
    },
  },
  {
    key: "skill",
    label: "Skills",
    singular: "skill group",
    blurb:
      "Group related skills so a tailored resume can pull the exact cluster a job asks for instead of a wall of keywords.",
    fields: [
      { key: "title", label: "Group name", placeholder: "Languages", required: true },
    ],
    bullets: false,
    skills: true,
    skillsLabel: "Skills in this group",
    skillsRequired: true,
    example: {
      title: "Languages",
      skills: ["JavaScript", "TypeScript", "PHP", "Dart", "SQL"],
    },
  },
  {
    key: "education",
    label: "Education",
    singular: "qualification",
    blurb: "Degrees and formal study, with the institution and dates as stated on your record.",
    fields: [
      {
        key: "title",
        label: "Qualification",
        placeholder: "BS Information Technology",
        required: true,
      },
      {
        key: "organization",
        label: "Institution",
        placeholder: "Pangasinan State University",
        required: true,
      },
      { key: "location", label: "Location", placeholder: "Urdaneta, PH" },
      ...dateFields,
      {
        key: "description",
        label: "Details",
        type: "textarea",
        placeholder: "Major, honours, relevant coursework.",
      },
    ],
    bullets: true,
    bulletsLabel: "Highlights",
    bulletsHint: "Optional. Thesis, awards or leadership roles — one per line.",
    skills: false,
    example: {
      title: "Bachelor of Science in Information Technology",
      organization: "Pangasinan State University – Urdaneta Campus",
      end_date: "July 2026",
      description: "Major in Web and Mobile Technologies",
    },
  },
  {
    key: "certification",
    label: "Certifications",
    singular: "certification",
    blurb: "Credentials with an issuer and a date, so claims stay verifiable.",
    fields: [
      { key: "title", label: "Credential", placeholder: "AWS Certified Developer", required: true },
      { key: "organization", label: "Issuer", placeholder: "Amazon Web Services", required: true },
      { key: "start_date", label: "Issued", placeholder: "March 2026", half: true },
      { key: "end_date", label: "Expires", placeholder: "March 2029", half: true },
      { key: "url", label: "Verification link", type: "url", placeholder: "https://…" },
    ],
    bullets: false,
    skills: false,
    example: {
      title: "AWS Certified Developer — Associate",
      organization: "Amazon Web Services",
      start_date: "March 2026",
    },
  },
  {
    key: "link",
    label: "Links",
    singular: "link",
    blurb: "Portfolio, repositories and profiles that back up the rest of the record.",
    fields: [
      { key: "title", label: "Label", placeholder: "Portfolio", required: true },
      {
        key: "url",
        label: "URL",
        type: "url",
        placeholder: "https://maurikfernandez-portfolio.vercel.app",
        required: true,
      },
      { key: "description", label: "Note", type: "textarea", placeholder: "What this link shows." },
    ],
    bullets: false,
    skills: false,
    example: {
      title: "Portfolio",
      url: "https://maurikfernandez-portfolio.vercel.app",
    },
  },
];

export const SUMMARY_EXAMPLE =
  "Software Developer and BS Information Technology graduate with hands-on experience developing, maintaining and deploying production web applications and backend systems. Skilled in troubleshooting production issues, integrating data across systems and implementing business workflows.";

export function sectionConfig(key: string) {
  return SECTIONS.find((s) => s.key === key);
}

export function dateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "";
  if (start && end) return `${start} – ${end}`;
  return (start || end) as string;
}

export function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
