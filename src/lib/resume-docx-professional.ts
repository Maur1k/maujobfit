import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TabStopPosition,
  TextRun,
} from "docx";

import {
  buildCertificationEntries,
  dateRange,
  groupSkills,
  normalizeEducationKey,
  parseEducationItem,
  type BuildProfessionalPdfInput,
  type ProEvidence,
  type ProItem,
} from "@/lib/resume-pdf-professional";


/**
 * Recruiter-facing DOCX renderer.
 *
 * Mirrors the professional PDF structure exactly and, like it, NEVER emits evidence
 * ids, citations, validation status, confidence, provenance, source text, banners or
 * any other internal metadata. It receives already-filtered content (supported claims
 * only) and stays fully editable in Microsoft Word and Google Docs: real heading
 * styles, real bullet numbering, real tab stops — no text boxes, tables or graphics.
 */

// All rendered text is pure black for maximum print/ATS contrast.
const INK = "000000";
const MUTED = "000000";
const RULE = "B0B0B8";

const DOCX_PAGE_SIZES = {
  letter: { width: 12240, height: 15840, contentWidth: 9360 }, // 8.5" x 11" with 1" margins
  a4: { width: 11906, height: 16838, contentWidth: 9026 }, // 210mm x 297mm with 1" margins
} as const;

function ruleBorder() {
  return { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 4 } };
}

export function buildProfessionalResumeDocx(input: BuildProfessionalPdfInput) {
  const bySection = (section: string) => input.items.filter((item) => item.section === section);
  const children: Paragraph[] = [];

  const name = (input.profile?.full_name || "").trim() || "Curriculum Vitae";
  const rawTarget = (input.jobTitle ?? "").trim();
  const target = (
    rawTarget.toLowerCase() === "untitled job" ? input.profile?.headline ?? "" : rawTarget || input.profile?.headline || ""
  ).trim();

  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: name, bold: true, size: 42, color: INK })],
    }),
  );

  if (target) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: target.toUpperCase(),
            bold: true,
            size: 21,
            color: MUTED,
            characterSpacing: 28,
          }),
        ],
      }),
    );
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

  for (const [index, line] of [contactPrimary, contactSecondary].entries()) {
    if (line.length === 0) continue;
    children.push(
      new Paragraph({
        spacing: { after: index === 1 ? 60 : 20 },
        children: [new TextRun({ text: line.join("   ·   "), size: 18, color: MUTED })],
      }),
    );
  }

  // horizontal rule under the header
  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 2 } },
      spacing: { after: 160 },
    }),
  );

  const sectionHeading = (label: string) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        border: ruleBorder(),
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: label.toUpperCase(),
            bold: true,
            size: 20,
            color: INK,
            characterSpacing: 22,
          }),
        ],
      }),
    );
  };

  const bodyParagraph = (text: string) =>
    new Paragraph({
      spacing: { after: 100, line: 300 },
      children: [new TextRun({ text, size: 20, color: INK })],
    });

  const bulletParagraph = (text: string) =>
    new Paragraph({
      numbering: { reference: "resume-bullets", level: 0 },
      spacing: { after: 60, line: 290 },
      children: [new TextRun({ text, size: 20, color: INK })],
    });

  // ---------- Summary ----------
  const summaryItems = bySection("summary");
  if (summaryItems.length) {
    sectionHeading("Professional Summary");
    children.push(bodyParagraph(summaryItems.map((item) => item.statement.trim()).join(" ")));
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

    sectionHeading(label);

    for (const key of order) {
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

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
          spacing: { before: 140, after: 20 },
          ...(dates
            ? { tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }] }
            : {}),
          children: [
            new TextRun({ text: key, bold: true, size: 22, color: INK }),
            ...(dates
              ? [new TextRun({ text: `\t${dates}`, italics: true, size: 18, color: MUTED })]
              : []),
          ],
        }),
      );

      if (subtitle) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { after: 20 },
            children: [new TextRun({ text: subtitle, size: 19, color: MUTED })],
          }),
        );
      }
      if (stack.length) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { after: 40 },
            children: [
              new TextRun({ text: stack.join(" · "), italics: true, size: 17, color: MUTED }),
            ],
          }),
        );
      }

      for (const item of groupItems) children.push(bulletParagraph(item.statement.trim()));
    }
  };

  renderGrouped("experience", "Experience");
  renderGrouped("project", "Projects");

  // ---------- Skills ----------
  const skillItems = bySection("skill");
  if (skillItems.length) {
    const grouped = groupSkills(skillItems.map((item) => item.statement.trim()).filter(Boolean));
    sectionHeading("Technical Skills");
    for (const group of grouped) {
      children.push(
        new Paragraph({
          spacing: { after: 60, line: 280 },
          children: [
            new TextRun({ text: `${group.label}: `, bold: true, size: 19, color: INK }),
            new TextRun({ text: group.skills.join(", "), size: 19, color: INK }),
          ],
        }),
      );
    }
  }

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

    sectionHeading("Education");

    for (const group of groups.values()) {
      const degreeLine = [group.degree, group.date].filter(Boolean).join(" – ");
      if (degreeLine) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 100, after: 20 },
            children: [new TextRun({ text: degreeLine, bold: true, size: 21, color: INK })],
          }),
        );
      }
      if (group.institution) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { after: 20 },
            children: [new TextRun({ text: group.institution, size: 19, color: MUTED })],
          }),
        );
      }
      for (const major of group.majors) {
        children.push(bodyParagraph(major));
      }
    }
  };

  const renderSimple = (section: string, label: string) => {
    const sectionItems = bySection(section);
    if (sectionItems.length === 0) return;
    const entries = buildCertificationEntries(sectionItems, (id) => input.evidence.get(id));
    if (entries.length === 0) return;
    sectionHeading(label);
    for (const entry of entries) {
      if (entry.title) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 100, after: 20 },
            children: [new TextRun({ text: entry.title, bold: true, size: 21, color: INK })],
          }),
        );
      }
      if (entry.meta) {
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { after: 20 },
            children: [new TextRun({ text: entry.meta, size: 19, color: MUTED })],
          }),
        );
      }
      for (const detail of entry.details) children.push(bodyParagraph(detail));
    }
  };


  renderEducation();
  renderSimple("certification", "Certifications");


  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20, color: INK } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 20, bold: true, color: INK },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0, keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 22, bold: true, color: INK },
          paragraph: { spacing: { before: 140, after: 20 }, outlineLevel: 1, keepNext: true },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 340, hanging: 220 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: DOCX_PAGE_SIZES[input.paperSize ?? "a4"].width,
              height: DOCX_PAGE_SIZES[input.paperSize ?? "a4"].height,
            },
            margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const slug = [input.profile?.full_name, input.jobTitle]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return {
    fileName: `${slug || "resume"}-resume.docx`,
    blob: () => Packer.toBlob(doc),
    contentWidth: DOCX_PAGE_SIZES[input.paperSize ?? "a4"].contentWidth,
  };
}
