export const REQUIREMENT_TYPES = [
  "required_skill",
  "preferred_skill",
  "responsibility",
  "qualification",
] as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const requirementTypeLabel: Record<string, string> = {
  required_skill: "Required skill",
  preferred_skill: "Preferred skill",
  responsibility: "Responsibility",
  qualification: "Qualification",
};

export const requirementTypeLabelPlural: Record<string, string> = {
  required_skill: "Required skills",
  preferred_skill: "Preferred skills",
  responsibility: "Responsibilities",
  qualification: "Qualifications",
};

export type JobRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  source_url: string | null;
  description: string | null;
  raw_text: string | null;
  seniority: string | null;
  keywords: string[];
  status: string;
  analysis_status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type JobRequirementRow = {
  id: string;
  job_id: string;
  requirement: string;
  requirement_type: string | null;
  importance: string | null;
  keywords: string[];
  canonical_skill: string | null;
  aliases: string[];
  related_skills: string[];
  sort_order: number;
};

export const MIN_JOB_TEXT_LENGTH = 200;
export const MAX_JOB_TEXT_LENGTH = 40000;

export function analysisStatusLabel(status: string) {
  switch (status) {
    case "analyzing":
      return "Analyzing";
    case "ready":
      return "Analyzed";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

/**
 * Canonical skills taxonomy. Key = canonical skill name, value = lowercase aliases
 * that mean exactly the same thing, plus related-but-not-equal skills.
 */
type TaxonomyEntry = { aliases: string[]; related?: string[] };

export const SKILL_TAXONOMY: Record<string, TaxonomyEntry> = {
  JavaScript: { aliases: ["javascript", "js", "es6", "ecmascript", "vanilla js"] },
  TypeScript: { aliases: ["typescript", "ts"], related: ["JavaScript"] },
  React: {
    aliases: ["react", "react.js", "reactjs", "react js"],
    related: ["JavaScript", "Frontend Development"],
  },
  "Next.js": { aliases: ["next.js", "nextjs", "next js"], related: ["React"] },
  "Vue.js": { aliases: ["vue", "vue.js", "vuejs"], related: ["JavaScript", "Frontend Development"] },
  Angular: { aliases: ["angular", "angularjs", "angular.js"], related: ["TypeScript"] },
  "Node.js": {
    aliases: ["node", "node.js", "nodejs", "node js"],
    related: ["JavaScript", "Backend Development"],
  },
  Express: { aliases: ["express", "express.js", "expressjs"], related: ["Node.js"] },
  PHP: { aliases: ["php", "php8", "php 8"], related: ["Backend Development"] },
  Laravel: { aliases: ["laravel"], related: ["PHP", "Backend Development"] },
  CodeIgniter: { aliases: ["codeigniter", "code igniter"], related: ["PHP"] },
  Python: { aliases: ["python", "python3"], related: ["Backend Development"] },
  Django: { aliases: ["django"], related: ["Python", "Backend Development"] },
  Flask: { aliases: ["flask"], related: ["Python", "Backend Development"] },
  Java: { aliases: ["java", "java se", "core java"], related: ["Backend Development"] },
  "Spring Boot": { aliases: ["spring", "spring boot", "springboot"], related: ["Java"] },
  "C#": { aliases: ["c#", "csharp", "c sharp"], related: ["Backend Development", ".NET"] },
  ".NET": { aliases: [".net", "dotnet", "asp.net", "asp.net core"], related: ["C#"] },
  Go: { aliases: ["go", "golang"], related: ["Backend Development"] },
  Ruby: { aliases: ["ruby"], related: ["Backend Development"] },
  "Ruby on Rails": { aliases: ["rails", "ruby on rails", "ror"], related: ["Ruby"] },
  Flutter: { aliases: ["flutter"], related: ["Dart", "Mobile Development"] },
  Dart: { aliases: ["dart"] },
  "React Native": { aliases: ["react native", "react-native"], related: ["React", "Mobile Development"] },
  Kotlin: { aliases: ["kotlin"], related: ["Mobile Development", "Java"] },
  Swift: { aliases: ["swift", "swiftui"], related: ["Mobile Development"] },
  HTML: { aliases: ["html", "html5"], related: ["Frontend Development"] },
  CSS: { aliases: ["css", "css3"], related: ["Frontend Development"] },
  "Tailwind CSS": { aliases: ["tailwind", "tailwindcss", "tailwind css"], related: ["CSS"] },
  Bootstrap: { aliases: ["bootstrap"], related: ["CSS"] },
  SQL: { aliases: ["sql", "rdbms", "relational databases"], related: ["Databases"] },
  MySQL: { aliases: ["mysql", "mariadb"], related: ["SQL", "Databases"] },
  PostgreSQL: { aliases: ["postgres", "postgresql", "psql"], related: ["SQL", "Databases"] },
  MongoDB: { aliases: ["mongo", "mongodb"], related: ["Databases", "NoSQL"] },
  NoSQL: { aliases: ["nosql"], related: ["Databases"] },
  Redis: { aliases: ["redis"], related: ["Databases"] },
  Firebase: { aliases: ["firebase", "firestore"], related: ["Databases", "Backend Development"] },
  Supabase: { aliases: ["supabase"], related: ["PostgreSQL", "Backend Development"] },
  "REST APIs": {
    aliases: ["rest", "rest api", "rest apis", "restful", "restful api", "api development"],
    related: ["Backend Development"],
  },
  GraphQL: { aliases: ["graphql"], related: ["REST APIs", "Backend Development"] },
  Git: { aliases: ["git", "version control", "github", "gitlab"] },
  Docker: { aliases: ["docker", "containers", "containerization"], related: ["DevOps"] },
  Kubernetes: { aliases: ["kubernetes", "k8s"], related: ["Docker", "DevOps"] },
  "CI/CD": {
    aliases: ["ci/cd", "cicd", "continuous integration", "continuous delivery", "github actions", "jenkins"],
    related: ["DevOps"],
  },
  AWS: { aliases: ["aws", "amazon web services"], related: ["Cloud Platforms"] },
  Azure: { aliases: ["azure", "microsoft azure"], related: ["Cloud Platforms"] },
  "Google Cloud": { aliases: ["gcp", "google cloud", "google cloud platform"], related: ["Cloud Platforms"] },
  "Cloud Platforms": { aliases: ["cloud", "cloud computing"] },
  DevOps: { aliases: ["devops"] },
  Linux: { aliases: ["linux", "unix", "ubuntu"] },
  Testing: {
    aliases: ["testing", "unit testing", "automated testing", "jest", "pytest", "qa testing"],
  },
  Agile: { aliases: ["agile", "scrum", "kanban", "sprints"] },
  "Frontend Development": { aliases: ["frontend", "front-end", "front end", "ui development"] },
  "Backend Development": { aliases: ["backend", "back-end", "back end", "server-side"] },
  "Full Stack Development": {
    aliases: ["full stack", "fullstack", "full-stack"],
    related: ["Frontend Development", "Backend Development"],
  },
  "Mobile Development": { aliases: ["mobile development", "mobile apps", "app development"] },
  Databases: { aliases: ["databases", "database design", "database management"] },
  "UI/UX Design": { aliases: ["ui/ux", "ux", "ui design", "ux design", "figma"] },
  "Problem Solving": { aliases: ["problem solving", "analytical thinking", "critical thinking"] },
  Communication: { aliases: ["communication", "communication skills", "written communication"] },
  Teamwork: { aliases: ["teamwork", "collaboration", "team player"] },
};

const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(SKILL_TAXONOMY)) {
    index.set(canonical.toLowerCase(), canonical);
    for (const alias of entry.aliases) index.set(alias.toLowerCase(), canonical);
  }
  return index;
})();

function normaliseToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type NormalisedSkill = {
  /** Canonical skill name when recognised, otherwise the cleaned original label. */
  canonical: string;
  /** True when the label matched an entry in the taxonomy. */
  recognised: boolean;
  /** Aliases of the canonical skill (empty for unrecognised labels). */
  aliases: string[];
  /** Related-but-not-equal skills — never treat these as exact matches. */
  related: string[];
};

export function normaliseSkill(label: string): NormalisedSkill {
  const cleaned = label.trim();
  const token = normaliseToken(cleaned);
  const canonical = ALIAS_INDEX.get(token);
  if (!canonical) {
    return { canonical: cleaned, recognised: false, aliases: [], related: [] };
  }
  const entry = SKILL_TAXONOMY[canonical]!;
  return {
    canonical,
    recognised: true,
    aliases: entry.aliases,
    related: entry.related ?? [],
  };
}

export function normaliseSkillList(labels: string[]): NormalisedSkill[] {
  const seen = new Set<string>();
  const out: NormalisedSkill[] = [];
  for (const label of labels) {
    if (!label?.trim()) continue;
    const skill = normaliseSkill(label);
    const key = skill.canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}
