import { jsPDF } from "jspdf";

/**
 * Recruiter-facing resume renderer.
 *
 * This renderer NEVER emits evidence ids, citation markers, validation status,
 * confidence, provenance, source text, banners or any other internal metadata.
 * It receives already-filtered content (supported claims only) and lays it out
 * as a clean, ATS-friendly single-column developer resume with selectable text.
 */

export type ProProfile = {
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
} | null;

export type ProEvidence = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  skills?: string[] | null;
};

export type ProItem = {
  id: string;
  section: string;
  heading: string | null;
  statement: string;
  /** evidence ids only used internally to look up role/company/date labels — never rendered */
  evidenceIds: string[];
};

export type BuildProfessionalPdfInput = {
  profile: ProProfile;
  jobTitle: string | null;
  items: ProItem[];
  evidence: Map<string, ProEvidence>;
  version: number;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 52;
const MARGIN_Y = 48;
const BODY_W = PAGE_W - MARGIN_X * 2;

const INK: [number, number, number] = [22, 22, 26];
const MUTED: [number, number, number] = [102, 102, 110];
const RULE: [number, number, number] = [176, 176, 184];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : match[1]!;
}

function dateRange(start: string | null | undefined, end: string | null | undefined) {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} – ${to}`;
  if (from) return `${from} – Present`;
  return to;
}

const SKILL_GROUPS: { label: string; match: RegExp }[] = [
  { label: "Languages", match: /^(javascript|typescript|php|python|java|c#|c\+\+|go|ruby|kotlin|swift|dart|sql|html5?|css3?|sass|scss)$/i },
  {
    label: "Frontend",
    match: /^(react|react native|next\.?js|vue|angular|svelte|tailwind ?css|bootstrap|jquery|redux|frontend development|responsive design|ui\/ux.*)$/i,
  },
  {
    label: "Backend",
    match: /^(node\.?js|express|nest\.?js|laravel|codeigniter|symfony|django|flask|spring|\.net|rest ?api|graphql|backend development|api development)$/i,
  },
  { label: "Databases", match: /^(mysql|postgresql|postgres|mongodb|sqlite|redis|firebase|supabase|oracle|mariadb)$/i },
  {
    label: "Tools & Platforms",
    match: /^(git|github|gitlab|docker|kubernetes|aws|azure|gcp|linux|jira|figma|vercel|netlify|ci\/cd|jenkins|webpack|vite|postman|wordpress)$/i,
  },
];

function groupSkills(names: string[]) {
  const groups = new Map<string, string[]>();
  const other: string[] = [];
  for (const name of names) {
    const group = SKILL_GROUPS.find((candidate) => candidate.match.test(name.trim()));
    if (!group) {
      other.push(name);
      continue;
    }
    const list = groups.get(group.label) ?? [];
    list.push(name);
    groups.set(group.label, list);
  }
  const ordered: { label: string; skills: string[] }[] = [];
  for (const group of SKILL_GROUPS) {
    const list = groups.get(group.label);
    if (list?.length) ordered.push({ label: group.label, skills: list });
  }
  if (other.length) ordered.push({ label: ordered.length ? "Also" : "Skills", skills: other });
  return ordered;
}

export function buildProfessionalResumePdf(input: BuildProfessionalPdfInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = MARGIN_Y;

  const setFont = (size: number, style: "normal" | "bold" | "italic" = "normal", color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const wrap = (value: string, size: number, style: "normal" | "bold" | "italic", width: number) => {
    setFont(size, style);
    return doc.splitTextToSize(value, width) as string[];
  };

  const newPage = () => {
    doc.addPage();
    y = MARGIN_Y;
  };

  const room = (needed: number) => y + needed <= PAGE_H - MARGIN_Y;
  const ensure = (needed: number) => {
    if (!room(needed)) newPage();
  };

  const block = (
    value: string,
    opts: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      color?: [number, number, number];
      indent?: number;
      width?: number;
      leading?: number;
      gap?: number;
      align?: "left" | "justify";
    } = {},
  ) => {
    const size = opts.size ?? 9.7;
    const style = opts.style ?? "normal";
    const indent = opts.indent ?? 0;
    const width = opts.width ?? BODY_W - indent;
    const leading = opts.leading ?? size * 1.34;
    const lines = wrap(value, size, style, width);
    setFont(size, style, opts.color ?? INK);
    for (const line of lines) {
      ensure(leading);
      setFont(size, style, opts.color ?? INK);
      doc.text(line, MARGIN_X + indent, y + size);
      y += leading;
    }
    y += opts.gap ?? 0;
  };

  const bullet = (value: string) => {
    const size = 9.7;
    const indent = 12;
    const leading = size * 1.36;
    const lines = wrap(value, size, "normal", BODY_W - indent);
    // keep at least two lines of a bullet together
    ensure(leading * Math.min(lines.length, 2));
    lines.forEach((line, index) => {
      ensure(leading);
      setFont(size, "normal");
      if (index === 0) doc.text("•", MARGIN_X + 2, y + size);
      doc.text(line, MARGIN_X + indent, y + size);
      y += leading;
    });
    y += 1.5;
  };

  const sectionHeading = (label: string, keepWith = 34) => {
    ensure(20 + keepWith);
    setFont(9.6, "bold");
    doc.setCharSpace(1.1);
    doc.text(label.toUpperCase(), MARGIN_X, y + 9.6);
    doc.setCharSpace(0);
    y += 14;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.7);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 9;
  };

  const rightText = (value: string, baselineY: number, size: number, style: "normal" | "italic" = "normal") => {
    setFont(size, style, MUTED);
    doc.text(value, PAGE_W - MARGIN_X, baselineY, { align: "right" });
  };

  // ---------- Header ----------
  const name = (input.profile?.full_name || "").trim() || "Curriculum Vitae";
  setFont(21, "bold");
  doc.setCharSpace(0.4);
  ensure(28);
  doc.text(name, MARGIN_X, y + 21);
  doc.setCharSpace(0);
  y += 27;

  const target = (input.jobTitle || input.profile?.headline || "").trim();
  if (target) {
    setFont(10.5, "bold", MUTED);
    doc.setCharSpace(1.4);
    doc.text(target.toUpperCase(), MARGIN_X, y + 10.5);
    doc.setCharSpace(0);
    y += 17;
  }

  const contactPrimary = [input.profile?.email, input.profile?.phone, input.profile?.location].filter(Boolean) as string[];
  const contactSecondary = [input.profile?.linkedin_url, input.profile?.github_url, input.profile?.portfolio_url]
    .filter(Boolean)
    .map((value) => String(value).replace(/^https?:\/\//, "").replace(/\/$/, ""));

  for (const line of [contactPrimary, contactSecondary]) {
    if (line.length === 0) continue;
    block(line.join("   ·   "), { size: 9, color: MUTED, leading: 12.5 });
  }

  y += 6;
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(1);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  doc.setLineWidth(0.7);
  y += 14;

  const bySection = (section: string) => input.items.filter((item) => item.section === section);

  // ---------- Summary ----------
  const summaryItems = bySection("summary");
  if (summaryItems.length) {
    sectionHeading("Professional Summary", 26);
    block(summaryItems.map((item) => item.statement.trim()).join(" "), { leading: 13.2, gap: 8 });
  }

  // ---------- Experience & Projects ----------
  const renderGrouped = (section: string, label: string) => {
    const sectionItems = bySection(section);
    if (sectionItems.length === 0) return;

    const order: string[] = [];
    const groups = new Map<string, ProItem[]>();
    for (const item of sectionItems) {
      const key = (item.heading || "").trim() || "General";
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(item);
    }

    sectionHeading(label, 40);

    order.forEach((key, groupIndex) => {
      const groupItems = groups.get(key)!;
      const records = groupItems
        .flatMap((item) => item.evidenceIds)
        .map((id) => input.evidence.get(id))
        .filter(Boolean) as ProEvidence[];
      const record = records[0];

      const dates = record ? dateRange(record.start_date, record.end_date) : "";
      const subtitle =
        section === "experience"
          ? [record?.organization, record?.title].filter((value) => value && !key.includes(value)).join(" · ")
          : "";
      const stack = section === "project" ? [...new Set(records.flatMap((r) => r.skills ?? []))].slice(0, 10) : [];

      const headingLines = wrap(key, 11, "bold", BODY_W - (dates ? 96 : 0));
      const needed = headingLines.length * 14.5 + (subtitle ? 12 : 0) + (stack.length ? 12 : 0) + 30;
      if (groupIndex > 0) y += 6;
      ensure(needed);

      setFont(11, "bold");
      headingLines.forEach((line, index) => {
        ensure(14.5);
        setFont(11, "bold");
        doc.text(line, MARGIN_X, y + 11);
        if (index === 0 && dates) rightText(dates, y + 11, 9, "italic");
        y += 14.5;
      });

      if (subtitle) block(subtitle, { size: 9.4, color: MUTED, leading: 12 });
      if (stack.length) block(stack.join(" · "), { size: 8.6, style: "italic", color: MUTED, leading: 11.5 });
      y += 2;

      for (const item of groupItems) bullet(item.statement.trim());
    });
    y += 6;
  };

  renderGrouped("experience", "Experience");
  renderGrouped("project", "Projects");

  // ---------- Skills ----------
  const skillItems = bySection("skill");
  if (skillItems.length) {
    const grouped = groupSkills(skillItems.map((item) => item.statement.trim()).filter(Boolean));
    sectionHeading("Technical Skills", 24);
    for (const group of grouped) {
      const labelText = `${group.label}: `;
      setFont(9.5, "bold");
      const labelWidth = doc.getTextWidth(labelText);
      const lines = wrap(group.skills.join(", "), 9.5, "normal", BODY_W - labelWidth);
      const leading = 13;
      ensure(leading * Math.min(lines.length, 2));
      lines.forEach((line, index) => {
        ensure(leading);
        if (index === 0) {
          setFont(9.5, "bold");
          doc.text(labelText, MARGIN_X, y + 9.5);
        }
        setFont(9.5, "normal");
        doc.text(line, MARGIN_X + (index === 0 ? labelWidth : labelWidth), y + 9.5);
        y += leading;
      });
      y += 1.5;
    }
  }

  const slug = [input.profile?.full_name, input.jobTitle]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const fileName = `${slug || "resume"}-resume.pdf`;

  return { blob: doc.output("blob") as Blob, fileName };
}
