import { jsPDF } from "jspdf";

/**
 * Recruiter-facing resume renderer.
 *
 * This renderer NEVER emits evidence ids, citation markers, validation status,
 * confidence, provenance, source text, banners or any other internal metadata.
 * It receives already-filtered content (supported claims only) and lays it out
 * as a clean, LinkedIn-inspired, ATS-friendly single-column resume with selectable text.
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

/**
 * Collapses certification items into one entry per credential:
 * a title, a single "Issuer · Date" meta line, and any remaining detail text.
 * Statements that merely repeat the issuer/date are dropped so the meta line
 * is never printed twice.
 */
export function buildCertificationEntries(
  items: ProItem[],
  lookup: (id: string) => ProEvidence | undefined,
) {
  const entries: { title: string; meta: string; details: string[] }[] = [];
  const byKey = new Map<string, { title: string; meta: string; details: string[] }>();

  for (const item of items) {
    const record = item.evidenceIds.map(lookup).find(Boolean);
    const title = (item.heading || "").trim() || (record?.title || "").trim();
    const dates = record ? dateRange(record.start_date, record.end_date) : "";
    const meta = [record?.organization?.trim(), dates].filter(Boolean).join("  ·  ");

    const key = `${normalizeEducationKey(title)}|${normalizeEducationKey(meta)}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { title, meta, details: [] };
      byKey.set(key, entry);
      entries.push(entry);
    }

    const statement = item.statement.trim();
    if (!statement) continue;
    const normalized = normalizeEducationKey(statement);
    const redundant =
      !normalized ||
      normalized === normalizeEducationKey(title) ||
      normalized === normalizeEducationKey(meta) ||
      normalizeEducationKey(meta).includes(normalized) ||
      normalized === normalizeEducationKey(record?.organization ?? "") ||
      entry.details.some((detail) => normalizeEducationKey(detail) === normalized);
    if (!redundant) entry.details.push(statement);
  }

  return entries.filter((entry) => entry.title || entry.meta || entry.details.length);
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


export type SkillInput = string | { name: string; group?: string | null };

/**
 * Groups skills for the Technical Skills section. When a skill arrives with the
 * user's own Master Resume group title, that grouping wins (first-seen order, so
 * job-relevant groups and skills lead). Skills without a group fall back to the
 * regex buckets below. Group names and skills are de-duplicated case-insensitively.
 */
export function groupSkills(names: SkillInput[]) {
  const explicit = new Map<string, string[]>();
  const explicitOrder: string[] = [];
  const inferred = new Map<string, string[]>();
  const other: string[] = [];

  const push = (map: Map<string, string[]>, label: string, values: string[]) => {
    const list = map.get(label) ?? [];
    for (const value of values) {
      if (!value) continue;
      if (!list.some((existing) => existing.toLowerCase() === value.toLowerCase())) list.push(value);
    }
    map.set(label, list);
  };

  const explicitKeys = new Map<string, string>();
  const pushExplicit = (label: string, values: string[]) => {
    const key = label.toLowerCase();
    const canonical = explicitKeys.get(key);
    if (canonical) {
      push(explicit, canonical, values);
      return;
    }
    explicitKeys.set(key, label);
    explicitOrder.push(label);
    push(explicit, label, values);
  };

  for (const entry of names) {
    const raw = typeof entry === "string" ? entry : entry.name;
    const name = (raw ?? "").trim();
    if (!name) continue;

    const ownGroup = typeof entry === "string" ? "" : (entry.group ?? "").trim();
    if (ownGroup) {
      // A skill whose name repeats its own group heading adds nothing to the line.
      if (ownGroup.toLowerCase() !== name.toLowerCase()) pushExplicit(ownGroup, [name]);
      continue;
    }
    // "Databases (MySQL, PostgreSQL)" → an author-provided category with members
    const labelled = /^([^()]{2,40}?)\s*\(([^()]+)\)$/.exec(name);
    if (labelled) {
      pushExplicit(
        labelled[1]!.trim(),
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
  const add = (label: string, skills: string[]) => {
    if (skills.length === 0) return;
    const existing = ordered.find((entry) => entry.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      for (const value of skills) {
        if (!existing.skills.some((skill) => skill.toLowerCase() === value.toLowerCase())) {
          existing.skills.push(value);
        }
      }
      return;
    }
    ordered.push({ label, skills: [...skills] });
  };

  // The user's own group titles lead, in the order their skills were selected.
  for (const label of explicitOrder) add(label, explicit.get(label) ?? []);
  // Fallback buckets only cover skills that arrived without a group of their own.
  for (const group of SKILL_GROUPS) add(group.label, inferred.get(group.label) ?? []);
  if (other.length) {
    // Drop leftovers that merely restate skills already printed above — a
    // run-together entry such as "JavaScript Tailwind CSS" adds nothing.
    const listed = ordered.flatMap((entry) => entry.skills.map((skill) => skill.toLowerCase()));
    const leftovers = other.filter((skill) => {
      const lower = skill.toLowerCase();
      const covered = listed.filter((known) => known !== lower && lower.includes(known));
      if (covered.length < 2) return true;
      const coverage = covered.reduce((total, known) => total + known.length, 0) / lower.length;
      return coverage < 0.7;
    });
    if (leftovers.length) add(ordered.length ? "Other Skills" : "Skills", leftovers);
  }

  // A skill already listed under an earlier group must not repeat further down.
  const seen = new Set<string>();
  const deduped: { label: string; skills: string[] }[] = [];
  for (const entry of ordered) {
    const skills = entry.skills.filter((skill) => {
      const key = skill.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (skills.length) deduped.push({ label: entry.label, skills });
  }
  return deduped;
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
      const justify = opts.align === "justify";
      const lines = wrap(value, size, style, width);
      setFont(size, style, opts.color ?? INK);
      lines.forEach((line, index) => {
        ensure(leading);
        setFont(size, style, opts.color ?? INK);
        if (justify && index < lines.length - 1) {
          doc.text(line, MARGIN_X + indent, y + s(size), { align: "justify", maxWidth: width });
        } else {
          doc.text(line, MARGIN_X + indent, y + s(size));
        }
        y += leading;
      });
      y += s(opts.gap ?? 0);
    };

    const bullet = (value: string) => {
      const size = 9.7;
      const indent = 12;
      const width = BODY_W - indent;
      const leading = s(size * 1.36);
      const lines = wrap(value, size, "normal", width);
      ensure(leading * Math.min(lines.length, 2));
      lines.forEach((line, index) => {
        ensure(leading);
        setFont(size, "normal");
        if (index === 0) doc.text("•", MARGIN_X + 2, y + s(size));
        doc.text(
          line,
          MARGIN_X + indent,
          y + s(size),
          index < lines.length - 1 ? { align: "justify", maxWidth: width } : undefined,
        );
        y += leading;
      });
      y += s(1);
    };

    const sectionHeading = (label: string, keepWith = 34) => {
      if (y > MARGIN_Y + 2) y += s(7);
      ensure(s(23 + keepWith));
      if (y <= MARGIN_Y + 2) y = MARGIN_Y;
      setFont(12, "bold");
      doc.text(label, MARGIN_X, y + s(12));
      y += s(16);
      doc.setDrawColor(INK[0], INK[1], INK[2]);
      doc.setLineWidth(1.15);
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
      doc.setLineWidth(0.7);
      y += s(7);
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
    setFont(24, "bold");
    ensure(s(31));
    doc.text(name, MARGIN_X, y + s(24));
    y += s(28);

    const rawTarget = (input.jobTitle ?? "").trim();
    const target = (
      rawTarget.toLowerCase() === "untitled job" ? input.profile?.headline ?? "" : rawTarget || input.profile?.headline || ""
    ).trim();
    if (target) {
      setFont(12, "bold", MUTED);
      doc.text(target, MARGIN_X, y + s(12));
      y += s(17);
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
      block(line.join("  •  "), { size: 9, color: MUTED, leading: 11.8 });
    }

    y += s(5);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(1.5);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    doc.setLineWidth(0.7);
    y += s(8);

    const bySection = (section: string) => input.items.filter((item) => item.section === section);

    // ---------- Summary ----------
    const summaryItems = bySection("summary");
    if (summaryItems.length) {
      sectionHeading("Professional Summary", 26);
      block(summaryItems.map((item) => item.statement.trim()).join(" "), { leading: 12.8, gap: 4, align: "justify" });
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

        const headingLines = wrap(key, 11.2, "bold", BODY_W - (dates ? 96 : 0));
        const needed = s(
          headingLines.length * 14.5 + (subtitle ? 12 : 0) + (stack.length ? 12 : 0) + 30,
        );
        if (groupIndex > 0) y += s(4.5);
        ensure(needed);

        setFont(11.2, "bold");
        headingLines.forEach((line, index) => {
          ensure(s(14.5));
          setFont(11.2, "bold");
          doc.text(line, MARGIN_X, y + s(11.2));
          if (index === 0 && dates) rightText(dates, y + s(11.2), 9, "normal");
          y += s(14.5);
        });

        if (subtitle)
          block(subtitle, { size: 9.4, style: "bold", color: MUTED, leading: 12, align: "justify" });
        if (stack.length)
          block(stack.join(" · "), {
            size: 8.6,
            style: "italic",
            color: MUTED,
            leading: 11.5,
            align: "justify",
          });
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
      const grouped = groupSkills(
        skillItems
          .map((item) => ({ name: item.statement.trim(), group: (item.heading ?? "").trim() }))
          .filter((entry) => entry.name),
      );
      sectionHeading("Technical Skills", 24);
      for (const group of grouped) {
        const labelText = `${group.label}:`;
        const skillText = group.skills.join(", ");
        const lines = wrap(`${labelText} ${skillText}`, 9.5, "normal", BODY_W);
        const leading = s(13);
        ensure(leading * Math.min(lines.length, 2));
        lines.forEach((line, index) => {
          ensure(leading);
          if (index === 0 && line.startsWith(labelText)) {
            setFont(9.5, "bold");
            doc.text(labelText, MARGIN_X, y + s(9.5));
            const labelWidth = doc.getTextWidth(labelText) + s(3);
            const remainder = line.slice(labelText.length).trimStart();
            setFont(9.5, "normal");
            doc.text(
              remainder,
              MARGIN_X + labelWidth,
              y + s(9.5),
              lines.length > 1 ? { align: "justify", maxWidth: BODY_W - labelWidth } : undefined,
            );
          } else {
            setFont(9.5, "normal");
            doc.text(
              line,
              MARGIN_X,
              y + s(9.5),
              index < lines.length - 1 ? { align: "justify", maxWidth: BODY_W } : undefined,
            );
          }
          y += leading;
        });
        y += s(0.5);
      }
    }

    // ---------- Education ----------
    const renderEducation = () => {
      const sectionItems = bySection("education");
      if (sectionItems.length === 0) return;

      const groups = new Map<
        string,
        { degree: string; institution: string; date: string; majors: Set<string> }
      >();

      for (const item of sectionItems) {
        const record = item.evidenceIds
          .map((id) => input.evidence.get(id))
          .find(Boolean) as ProEvidence | undefined;
        const parsed = parseEducationItem(item, record);
        const key = `${normalizeEducationKey(parsed.degree)}|${normalizeEducationKey(parsed.institution)}`;
        const existing = groups.get(key);
        if (existing) {
          for (const major of parsed.majors) if (major) existing.majors.add(major);
        } else {
          groups.set(key, {
            degree: parsed.degree,
            institution: parsed.institution,
            date: parsed.date,
            majors: new Set(parsed.majors),
          });
        }
      }

      sectionHeading("Education", 26);

      let groupIndex = 0;
      for (const group of groups.values()) {
        if (groupIndex > 0) y += s(4);
        const degreeLine = [group.degree, group.date].filter(Boolean).join(" – ");
        if (degreeLine) block(degreeLine, { size: 10.5, style: "bold", leading: 13.6 });
        if (group.institution)
          block(group.institution, { size: 9.4, color: MUTED, leading: 12.2, align: "justify" });
        for (const major of group.majors) {
          block(major, { size: 9.5, leading: 12.2, align: "justify" });
        }
        groupIndex++;
      }
      y += s(2);
    };

    // ---------- Certifications ----------
    const renderSimple = (section: string, label: string) => {
      const sectionItems = bySection(section);
      if (sectionItems.length === 0) return;
      const entries = buildCertificationEntries(sectionItems, (id) => input.evidence.get(id));
      if (entries.length === 0) return;
      sectionHeading(label, 26);
      entries.forEach((entry, entryIndex) => {
        if (entryIndex > 0) y += s(4);

        if (entry.title) {
          const headingLines = wrap(entry.title, 10.5, "bold", BODY_W);
          for (const line of headingLines) {
            ensure(s(13.6));
            setFont(10.5, "bold");
            doc.text(line, MARGIN_X, y + s(10.5));
            y += s(13.6);
          }
        }

        if (entry.meta)
          block(entry.meta, { size: 9.4, color: MUTED, leading: 12.2, align: "justify" });
        for (const detail of entry.details) block(detail, { size: 9.5, leading: 12.2, align: "justify" });
      });
      y += s(2);
    };


    renderEducation();
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
