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
  paperSize?: "a4" | "letter";
  onePage?: boolean;
};

export const PAGE_DIMENSIONS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

// All rendered text is pure black for maximum print/ATS contrast.
const INK: [number, number, number] = [0, 0, 0];
const MUTED: [number, number, number] = [0, 0, 0];
const RULE: [number, number, number] = [176, 176, 184];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : match[1]!;
}

export function dateRange(start: string | null | undefined, end: string | null | undefined) {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} – ${to}`;
  if (from) return `${from} – Present`;
  return to;
}

function educationYear(value: string | null | undefined) {
  if (!value) return null;
  const match = /\b(19|20)\d{2}\b/.exec(value);
  return match ? match[0] : null;
}

export function educationDate(record: ProEvidence | undefined) {
  if (!record) return "";
  const startYear = educationYear(record.start_date);
  const endYear = educationYear(record.end_date);
  if (startYear && endYear) return `${startYear} – ${endYear}`;
  if (endYear) return `Batch ${endYear}`;
  if (startYear) return `${startYear} – Present`;
  return "";
}

export function normalizeEducationKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isRedundant(part: string, reference: string) {
  if (!reference || !part) return false;
  const p = normalizeEducationKey(part);
  const r = normalizeEducationKey(reference);
  return p === r || r.includes(p) || p.includes(r);
}

export function parseEducationItem(item: ProItem, record: ProEvidence | undefined) {
  const heading = (item.heading || "").trim();
  const statement = item.statement.trim();

  let degree = "";
  let majorFromHeading = "";
  let institution = "";

  const dashParts = heading.split(/ — /).map((s) => s.trim());
  if (dashParts.length >= 2) {
    institution = dashParts[dashParts.length - 1]!;
    const beforeInstitution = dashParts.slice(0, -1).join(" — ");
    const pipeParts = beforeInstitution.split(" | ").map((s) => s.trim()).filter(Boolean);
    degree = pipeParts[0] || "";
    majorFromHeading = pipeParts.slice(1).join(" · ");
  } else {
    const pipeParts = heading.split(" | ").map((s) => s.trim()).filter(Boolean);
    degree = pipeParts[0] || "";
    majorFromHeading = pipeParts.slice(1).join(" · ");
  }

  if (!institution && record?.organization) institution = record.organization.trim();
  if (!degree && record?.title) {
    const parts = record.title.split(" | ").map((s) => s.trim()).filter(Boolean);
    degree = parts[0] || record.title;
  }

  const datePatterns = [
    /Batch\s+(19|20)\d{2}/gi,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(19|20)\d{2}/gi,
    /(19|20)\d{2}\s*–\s*(19|20)\d{2}/g,
    /–\s*(19|20)\d{2}/g,
    /\b(19|20)\d{2}\b/g,
  ];
  let cleanedStatement = statement;
  for (const pattern of datePatterns) {
    cleanedStatement = cleanedStatement.replace(pattern, "");
  }

  const statementParts = cleanedStatement
    .split(/[·|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .filter((s) => !isRedundant(s, degree) && !isRedundant(s, institution));

  const majors = new Set<string>();
  if (majorFromHeading) majors.add(majorFromHeading);
  for (const part of statementParts) majors.add(part);

  return {
    degree,
    institution,
    date: educationDate(record),
    majors: [...majors],
  };
}


const SKILL_GROUPS: { label: string; match: RegExp }[] = [
  {
    label: "Languages",
    match:
      /^(javascript|typescript|php|python|java|c#|c\+\+|go|ruby|kotlin|swift|dart|sql|html5?|css3?|sass|scss)$/i,
  },
  {
    label: "Frontend",
    match:
      /^(react|react native|next\.?js|vue|angular|svelte|tailwind ?css|bootstrap|jquery|redux|frontend development|responsive design|ui\/ux.*)$/i,
  },
  {
    label: "Backend",
    match:
      /^(node\.?js|express|nest\.?js|laravel|codeigniter|symfony|django|flask|spring|\.net|rest ?api|graphql|backend development|api development)$/i,
  },
  {
    label: "Databases",
    match: /^(mysql|postgresql|postgres|mongodb|sqlite|redis|firebase|supabase|oracle|mariadb)$/i,
  },
  {
    label: "Tools & Platforms",
    match:
      /^(git|github|gitlab|docker|kubernetes|aws|azure|gcp|linux|jira|figma|vercel|netlify|ci\/cd|jenkins|webpack|vite|postman|wordpress)$/i,
  },
];

export function groupSkills(names: string[]) {
  const explicit = new Map<string, string[]>();
  const explicitOrder: string[] = [];
  const inferred = new Map<string, string[]>();
  const other: string[] = [];

  const push = (map: Map<string, string[]>, label: string, values: string[]) => {
    const list = map.get(label) ?? [];
    for (const value of values) if (value && !list.includes(value)) list.push(value);
    map.set(label, list);
  };

  for (const raw of names) {
    const name = raw.trim();
    // "Databases (MySQL, PostgreSQL)" → an author-provided category with members
    const labelled = /^([^()]{2,40}?)\s*\(([^()]+)\)$/.exec(name);
    if (labelled) {
      const label = labelled[1]!.trim();
      if (!explicit.has(label)) explicitOrder.push(label);
      push(
        explicit,
        label,
        labelled[2]!
          .split(/[,;/]/)
          .map((value) => value.trim())
          .filter(Boolean),
      );
      continue;
    }
    const group = SKILL_GROUPS.find((candidate) => candidate.match.test(name));
    if (group) push(inferred, group.label, [name]);
    else other.push(name);
  }

  const ordered: { label: string; skills: string[] }[] = [];
  for (const group of SKILL_GROUPS) {
    const list = inferred.get(group.label);
    if (list?.length) ordered.push({ label: group.label, skills: list });
  }
  for (const label of explicitOrder) {
    const list = explicit.get(label);
    if (!list?.length) continue;
    const existing = ordered.find((entry) => entry.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      for (const value of list) if (!existing.skills.includes(value)) existing.skills.push(value);
    } else {
      ordered.push({ label, skills: list });
    }
  }
  if (other.length)
    ordered.push({ label: ordered.length ? "Additional" : "Skills", skills: other });
  return ordered;
}

export function buildProfessionalResumePdf(input: BuildProfessionalPdfInput) {
  const paperSize = input.paperSize ?? "a4";
  const { width: PAGE_W, height: PAGE_H } = PAGE_DIMENSIONS[paperSize];
  const MARGIN_X = 48;
  const MARGIN_Y = 40;
  const BODY_W = PAGE_W - MARGIN_X * 2;

  const renderDoc = (scale = 1.0) => {
    const doc = new jsPDF({ unit: "pt", format: paperSize, compress: true });
    let y = MARGIN_Y;

    const s = (val: number) => Math.round(val * scale * 100) / 100;

    const setFont = (size: number, style: "normal" | "bold" | "italic" = "normal", color = INK) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(s(size));
      doc.setTextColor(color[0], color[1], color[2]);
    };

    const wrap = (
      value: string,
      size: number,
      style: "normal" | "bold" | "italic",
      width: number,
    ) => {
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
      const leading = s(opts.leading ?? size * 1.34);
      const lines = wrap(value, size, style, width);
      setFont(size, style, opts.color ?? INK);
      for (const line of lines) {
        ensure(leading);
        setFont(size, style, opts.color ?? INK);
        doc.text(line, MARGIN_X + indent, y + s(size));
        y += leading;
      }
      y += s(opts.gap ?? 0);
    };

    const bullet = (value: string) => {
      const size = 9.7;
      const indent = 12;
      const leading = s(size * 1.36);
      const lines = wrap(value, size, "normal", BODY_W - indent);
      ensure(leading * Math.min(lines.length, 2));
      lines.forEach((line, index) => {
        ensure(leading);
        setFont(size, "normal");
        if (index === 0) doc.text("•", MARGIN_X + 2, y + s(size));
        doc.text(line, MARGIN_X + indent, y + s(size));
        y += leading;
      });
      y += s(1);
    };

    const sectionHeading = (label: string, keepWith = 34) => {
      if (y > MARGIN_Y + 2) y += s(6);
      ensure(s(20 + keepWith));
      if (y <= MARGIN_Y + 2) y = MARGIN_Y;
      setFont(9.6, "bold");
      doc.setCharSpace(1.1);
      doc.text(label.toUpperCase(), MARGIN_X, y + s(9.6));
      doc.setCharSpace(0);
      y += s(13);
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.7);
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
      y += s(6.5);
    };

    const rightText = (
      value: string,
      baselineY: number,
      size: number,
      style: "normal" | "italic" = "normal",
    ) => {
      setFont(size, style, MUTED);
      doc.text(value, PAGE_W - MARGIN_X, baselineY, { align: "right" });
    };

    // ---------- Header ----------
    const name = (input.profile?.full_name || "").trim() || "Curriculum Vitae";
    setFont(21, "bold");
    doc.setCharSpace(0.4);
    ensure(s(28));
    doc.text(name, MARGIN_X, y + s(21));
    doc.setCharSpace(0);
    y += s(24);

    const rawTarget = (input.jobTitle ?? "").trim();
    const target = (
      rawTarget.toLowerCase() === "untitled job" ? input.profile?.headline ?? "" : rawTarget || input.profile?.headline || ""
    ).trim();
    if (target) {
      setFont(10.5, "bold", MUTED);
      doc.setCharSpace(1.4);
      doc.text(target.toUpperCase(), MARGIN_X, y + s(10.5));
      doc.setCharSpace(0);
      y += s(15);
    }

    const contactPrimary = [
      input.profile?.email,
      input.profile?.phone,
      input.profile?.location,
    ].filter(Boolean) as string[];
    const contactSecondary = [
      input.profile?.linkedin_url,
      input.profile?.github_url,
      input.profile?.portfolio_url,
    ]
      .filter(Boolean)
      .map((value) =>
        String(value)
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, ""),
      );

    for (const line of [contactPrimary, contactSecondary]) {
      if (line.length === 0) continue;
      block(line.join("   ·   "), { size: 9, color: MUTED, leading: 11.6 });
    }

    y += s(4);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(1);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    doc.setLineWidth(0.7);
    y += s(10);

    const bySection = (section: string) => input.items.filter((item) => item.section === section);

    // ---------- Summary ----------
    const summaryItems = bySection("summary");
    if (summaryItems.length) {
      sectionHeading("Professional Summary", 26);
      block(summaryItems.map((item) => item.statement.trim()).join(" "), { leading: 12.8, gap: 4 });
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
            ? [record?.organization, record?.title]
                .filter((value) => value && !key.includes(value))
                .join(" · ")
            : "";
        const stack =
          section === "project"
            ? [...new Set(records.flatMap((r) => r.skills ?? []))].slice(0, 10)
            : [];

        const headingLines = wrap(key, 11, "bold", BODY_W - (dates ? 96 : 0));
        const needed = s(
          headingLines.length * 14.5 + (subtitle ? 12 : 0) + (stack.length ? 12 : 0) + 30,
        );
        if (groupIndex > 0) y += s(4.5);
        ensure(needed);

        setFont(11, "bold");
        headingLines.forEach((line, index) => {
          ensure(s(14.5));
          setFont(11, "bold");
          doc.text(line, MARGIN_X, y + s(11));
          if (index === 0 && dates) rightText(dates, y + s(11), 9, "italic");
          y += s(14.5);
        });

        if (subtitle) block(subtitle, { size: 9.4, color: MUTED, leading: 12 });
        if (stack.length)
          block(stack.join(" · "), { size: 8.6, style: "italic", color: MUTED, leading: 11.5 });
        y += s(2);

        for (const item of groupItems) bullet(item.statement.trim());
      });
      y += s(3);
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
        const labelWidth = doc.getTextWidth(labelText) + s(2);
        const lines = wrap(group.skills.join(", "), 9.5, "normal", BODY_W - labelWidth);
        const leading = s(13);
        ensure(leading * Math.min(lines.length, 2));
        lines.forEach((line, index) => {
          ensure(leading);
          if (index === 0) {
            setFont(9.5, "bold");
            doc.text(labelText, MARGIN_X, y + s(9.5));
          }
          setFont(9.5, "normal");
          doc.text(line, MARGIN_X + labelWidth, y + s(9.5));
          y += leading;
        });
        y += s(0.5);
      }
    }

    // ---------- Education & Certifications ----------
    const renderSimple = (section: string, label: string) => {
      const sectionItems = bySection(section);
      if (sectionItems.length === 0) return;
      sectionHeading(label, 26);
      sectionItems.forEach((item, itemIndex) => {
        const heading = (item.heading || "").trim();
        const record = item.evidenceIds
          .map((id) => input.evidence.get(id))
          .find(Boolean) as ProEvidence | undefined;

        if (itemIndex > 0) y += s(4);

        if (heading) {
          const headingLines = wrap(heading, 10.5, "bold", BODY_W);
          for (const line of headingLines) {
            ensure(s(13.6));
            setFont(10.5, "bold");
            doc.text(line, MARGIN_X, y + s(10.5));
            y += s(13.6);
          }
        }

        // Institution · date on one muted line, mirroring the on-screen layout
        const dates = record ? dateRange(record.start_date, record.end_date) : "";
        const meta = [record?.organization, dates].filter(Boolean).join("  ·  ");
        if (meta) block(meta, { size: 9.4, color: MUTED, leading: 12.2 });

        const statement = item.statement.trim();
        const normalized = statement.toLowerCase();
        const duplicate =
          normalized === heading.toLowerCase() ||
          (!!meta && normalized === meta.toLowerCase()) ||
          (!!record?.organization && normalized === record.organization.trim().toLowerCase());
        if (statement && !duplicate) block(statement, { size: 9.5, leading: 12.2 });
      });
      y += s(2);
    };


    renderSimple("education", "Education");
    renderSimple("certification", "Certifications");

    return doc;
  };

  let doc = renderDoc(1.0);

  // If onePage is requested, automatically micro-scale down if content overflowed onto page 2
  if (input.onePage && doc.getNumberOfPages() > 1) {
    const scaleSteps = [0.97, 0.94, 0.91, 0.88, 0.85, 0.82];
    for (const step of scaleSteps) {
      const scaledDoc = renderDoc(step);
      if (scaledDoc.getNumberOfPages() === 1) {
        doc = scaledDoc;
        break;
      }
      // If we reach the last scale step, use it as the tightest attempt
      if (step === scaleSteps[scaleSteps.length - 1]) {
        doc = scaledDoc;
      }
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
