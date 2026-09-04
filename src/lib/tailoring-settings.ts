/**
 * Tailoring settings drive *composition only*.
 *
 * They decide how much of the master resume is presented in a tailored version
 * and in what order. They never delete, reorder or filter master-resume records.
 */

export const RESUME_LENGTHS = ["one_page", "two_page"] as const;
export const TAILORING_LEVELS = ["conservative", "balanced", "aggressive"] as const;
export const PROJECT_INCLUSIONS = ["most_relevant", "relevant_supporting", "all"] as const;
export const SKILLS_SCOPES = ["job_only", "relevant_supporting", "full_master"] as const;
export const PAPER_SIZES = ["a4"] as const;

export type ResumeLength = (typeof RESUME_LENGTHS)[number];
export type TailoringLevel = (typeof TAILORING_LEVELS)[number];
export type ProjectInclusion = (typeof PROJECT_INCLUSIONS)[number];
export type SkillsScope = (typeof SKILLS_SCOPES)[number];
export type PaperSize = (typeof PAPER_SIZES)[number];

export type TailoringSettings = {
  resume_length: ResumeLength;
  tailoring_level: TailoringLevel;
  project_inclusion: ProjectInclusion;
  skills_scope: SkillsScope;
  paper_size: PaperSize;
  include_summary: boolean;
  include_experience: boolean;
  include_projects: boolean;
  include_skills: boolean;
  include_education: boolean;
  include_certifications: boolean;
};

export const DEFAULT_TAILORING_SETTINGS: TailoringSettings = {
  resume_length: "two_page",
  tailoring_level: "balanced",
  project_inclusion: "relevant_supporting",
  skills_scope: "relevant_supporting",
  paper_size: "letter",
  include_summary: true,
  include_experience: true,
  include_projects: true,
  include_skills: true,
  include_education: true,
  include_certifications: true,
};

export const resumeLengthLabel: Record<ResumeLength, string> = {
  one_page: "1 page",
  two_page: "2 pages",
};

export const tailoringLevelLabel: Record<TailoringLevel, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export const projectInclusionLabel: Record<ProjectInclusion, string> = {
  most_relevant: "Most relevant only",
  relevant_supporting: "Relevant + supporting",
  all: "All projects",
};

export const skillsScopeLabel: Record<SkillsScope, string> = {
  job_only: "Job skills only",
  relevant_supporting: "Relevant + supporting",
  full_master: "Full master skills",
};

export const paperSizeLabel: Record<PaperSize, string> = {
  letter: "US Letter (8.5 × 11 in)",
  a4: "A4 (210 × 297 mm)",
};

type Option<T extends string> = { value: T; label: string; description: string };

export const RESUME_LENGTH_OPTIONS: Option<ResumeLength>[] = [
  {
    value: "one_page",
    label: resumeLengthLabel.one_page,
    description: "Tightest version. Low-priority content is set aside for this version only.",
  },
  {
    value: "two_page",
    label: resumeLengthLabel.two_page,
    description: "Recommended for developers — a complete, focused professional resume.",
  },
];

export const PAPER_SIZE_OPTIONS: Option<PaperSize>[] = [
  {
    value: "letter",
    label: paperSizeLabel.letter,
    description: "Standard for US and Canada ATS systems and recruiter printing.",
  },
  {
    value: "a4",
    label: paperSizeLabel.a4,
    description: "Standard for UK, Europe, Australia, and international recruiters.",
  },
];

export const TAILORING_LEVEL_OPTIONS: Option<TailoringLevel>[] = [
  {
    value: "conservative",
    label: tailoringLevelLabel.conservative,
    description: "Keeps the most source content; light re-emphasis only.",
  },
  {
    value: "balanced",
    label: tailoringLevelLabel.balanced,
    description:
      "Recommended. Emphasises what the job asks for while keeping transferable evidence.",
  },
  {
    value: "aggressive",
    label: tailoringLevelLabel.aggressive,
    description:
      "Narrows to the closest-fitting evidence. Nothing is deleted from your Master Resume.",
  },
];

export const PROJECT_INCLUSION_OPTIONS: Option<ProjectInclusion>[] = [
  {
    value: "most_relevant",
    label: projectInclusionLabel.most_relevant,
    description: "Only projects that answer the posting directly.",
  },
  {
    value: "relevant_supporting",
    label: projectInclusionLabel.relevant_supporting,
    description: "Recommended. Relevant projects plus ones showing transferable technologies.",
  },
  {
    value: "all",
    label: projectInclusionLabel.all,
    description: "Every project in your Master Resume.",
  },
];

export const SKILLS_SCOPE_OPTIONS: Option<SkillsScope>[] = [
  {
    value: "job_only",
    label: skillsScopeLabel.job_only,
    description: "Narrowest — only skills this posting names or is adjacent to.",
  },
  {
    value: "relevant_supporting",
    label: skillsScopeLabel.relevant_supporting,
    description: "Recommended. Job-relevant skills first, plus your broader web-development stack.",
  },
  {
    value: "full_master",
    label: skillsScopeLabel.full_master,
    description: "Your complete technical skill set, relevant skills ordered first.",
  },
];

export type CompositionBudget = {
  experienceGroups: number;
  experienceBullets: number;
  projectGroups: number;
  projectBullets: number;
  maxSkills: number;
  includeLow: boolean;
  summarySentences: string;
};

export function compositionBudget(settings: TailoringSettings): CompositionBudget {
  const onePage = settings.resume_length === "one_page";
  const base: CompositionBudget = onePage
    ? {
        experienceGroups: 5,
        experienceBullets: 3,
        projectGroups: 3,
        projectBullets: 2,
        maxSkills: 24,
        includeLow: true,
        summarySentences: "2 sentences",
      }
    : {
        experienceGroups: 8,
        experienceBullets: 5,
        projectGroups: 6,
        projectBullets: 4,
        maxSkills: 50,
        includeLow: true,
        summarySentences: "3 sentences",
      };

  if (settings.project_inclusion === "all") base.projectGroups = Math.max(base.projectGroups, 12);
  if (settings.project_inclusion === "most_relevant")
    base.projectGroups = Math.min(base.projectGroups, 3);

  if (settings.skills_scope === "full_master") base.maxSkills = 100;
  if (settings.skills_scope === "job_only") base.maxSkills = Math.min(base.maxSkills, 18);

  if (settings.tailoring_level === "conservative") {
    base.includeLow = true;
    base.projectGroups += 2;
    base.experienceBullets += 1;
  }
  if (settings.tailoring_level === "aggressive") {
    base.projectGroups = Math.max(2, base.projectGroups - 1);
    base.experienceBullets = Math.max(2, base.experienceBullets - 1);
  }

  return base;
}

const RESUME_LENGTH_SET = new Set<string>(RESUME_LENGTHS);
const LEVEL_SET = new Set<string>(TAILORING_LEVELS);
const PROJECT_SET = new Set<string>(PROJECT_INCLUSIONS);
const SKILLS_SET = new Set<string>(SKILLS_SCOPES);
const PAPER_SIZE_SET = new Set<string>(PAPER_SIZES);

/** Coerces a persisted row (or an unknown jsonb snapshot) into valid settings. */
export function normaliseSettings(input: unknown): TailoringSettings {
  const row = (input ?? {}) as Partial<Record<keyof TailoringSettings, unknown>>;
  const bool = (key: keyof TailoringSettings) =>
    typeof row[key] === "boolean"
      ? (row[key] as boolean)
      : DEFAULT_TAILORING_SETTINGS[key] === true;

  return {
    resume_length: RESUME_LENGTH_SET.has(String(row.resume_length))
      ? (row.resume_length as ResumeLength)
      : DEFAULT_TAILORING_SETTINGS.resume_length,
    tailoring_level: LEVEL_SET.has(String(row.tailoring_level))
      ? (row.tailoring_level as TailoringLevel)
      : DEFAULT_TAILORING_SETTINGS.tailoring_level,
    project_inclusion: PROJECT_SET.has(String(row.project_inclusion))
      ? (row.project_inclusion as ProjectInclusion)
      : DEFAULT_TAILORING_SETTINGS.project_inclusion,
    skills_scope: SKILLS_SET.has(String(row.skills_scope))
      ? (row.skills_scope as SkillsScope)
      : DEFAULT_TAILORING_SETTINGS.skills_scope,
    paper_size: PAPER_SIZE_SET.has(String(row.paper_size))
      ? (row.paper_size as PaperSize)
      : DEFAULT_TAILORING_SETTINGS.paper_size,
    include_summary: bool("include_summary"),
    include_experience: bool("include_experience"),
    include_projects: bool("include_projects"),
    include_skills: bool("include_skills"),
    include_education: bool("include_education"),
    include_certifications: bool("include_certifications"),
  };
}

export function settingsSummary(settings: TailoringSettings) {
  return [
    resumeLengthLabel[settings.resume_length],
    settings.paper_size === "a4" ? "A4" : "Letter",
    tailoringLevelLabel[settings.tailoring_level],
    `Projects: ${projectInclusionLabel[settings.project_inclusion]}`,
    `Skills: ${skillsScopeLabel[settings.skills_scope]}`,
  ].join(" · ");
}

export const SECTION_TOGGLES: { key: keyof TailoringSettings; label: string }[] = [
  { key: "include_summary", label: "Professional Summary" },
  { key: "include_experience", label: "Experience" },
  { key: "include_projects", label: "Projects" },
  { key: "include_skills", label: "Technical Skills" },
  { key: "include_education", label: "Education" },
  { key: "include_certifications", label: "Certifications" },
];
