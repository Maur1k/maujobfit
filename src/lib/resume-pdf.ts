import { jsPDF } from "jspdf";

import { tailoredSectionLabel, TAILORED_SECTIONS } from "@/lib/tailoring";
import { validationStatusLabel } from "@/lib/validation";

export type PdfProfile = {
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
} | null;

export type PdfEvidence = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  content: string;
};

export type PdfItem = {
  id: string;
  section: string;
  heading: string | null;
  statement: string;
  validationStatus: string;
  validationRationale: string | null;
  sources: { resume_evidence_id: string; support_type: string; excerpt: string | null }[];
};

export type BuildPdfInput = {
  profile: PdfProfile;
  jobTitle: string | null;
  jobCompany: string | null;
  resumeTitle: string;
  version: number;
  items: PdfItem[];
  evidence: Map<string, PdfEvidence>;
  supportedOnly: boolean;
  excludedCount: number;
};

const MARGIN = 46;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const BODY_W = PAGE_W - MARGIN * 2;

export function buildTailoredResumePdf(input: BuildPdfInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const text = (
    value: string,
    opts: { size?: number; style?: "normal" | "bold" | "italic"; color?: [number, number, number]; indent?: number; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    const color = opts.color ?? [24, 24, 27];
    doc.setTextColor(color[0], color[1], color[2]);
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(value, BODY_W - indent) as string[];
    const lineHeight = size * 1.35;
    for (const line of lines) {
      ensure(lineHeight);
      doc.text(line, MARGIN + indent, y + size);
      y += lineHeight;
    }
    y += opts.gap ?? 0;
  };

  const rule = () => {
    ensure(12);
    doc.setDrawColor(210, 210, 214);
    doc.line(MARGIN, y + 4, PAGE_W - MARGIN, y + 4);
    y += 12;
  };

  // Header
  text(input.profile?.full_name || "Tailored resume", { size: 20, style: "bold" });
  if (input.profile?.headline) text(input.profile.headline, { size: 11, color: [90, 90, 96] });
  const contact = [
    input.profile?.email,
    input.profile?.phone,
    input.profile?.location,
    input.profile?.portfolio_url,
    input.profile?.github_url,
    input.profile?.linkedin_url,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) text(contact, { size: 9, color: [90, 90, 96] });
  text(
    `Tailored for ${[input.jobTitle, input.jobCompany].filter(Boolean).join(" at ") || "this role"} · ${input.resumeTitle} v${input.version}`,
    { size: 9, color: [90, 90, 96], gap: 4 },
  );

  // Mode banner
  const bannerLines = input.supportedOnly
    ? [
        "VALIDATED EXPORT — SUPPORTED CLAIMS ONLY",
        `Every line below carries validation status "supported": each claim was checked against the cited master resume evidence.${
          input.excludedCount > 0
            ? ` ${input.excludedCount} flagged item${input.excludedCount === 1 ? "" : "s"} were excluded from this export and remain in the working draft.`
            : ""
        }`,
      ]
    : [
        "FULL WORKING DRAFT — NOT VALIDATION-FILTERED",
        "This export includes claims that are partially supported, unsupported or awaiting review. Check the status marker on each item before sending it anywhere.",
      ];
  const bannerColor: [number, number, number] = input.supportedOnly ? [22, 101, 52] : [180, 83, 9];
  ensure(52);
  doc.setDrawColor(bannerColor[0], bannerColor[1], bannerColor[2]);
  doc.setLineWidth(1);
  const bannerTop = y;
  y += 8;
  text(bannerLines[0]!, { size: 9, style: "bold", color: bannerColor, indent: 10 });
  text(bannerLines[1]!, { size: 8, color: [70, 70, 76], indent: 10 });
  y += 4;
  doc.rect(MARGIN, bannerTop, BODY_W, y - bannerTop);
  y += 14;
  doc.setLineWidth(0.5);

  // Evidence marker registry
  const markers = new Map<string, string>();
  const orderedEvidence: PdfEvidence[] = [];
  const markerFor = (evidenceId: string) => {
    const existing = markers.get(evidenceId);
    if (existing) return existing;
    const record = input.evidence.get(evidenceId);
    const marker = `E${orderedEvidence.length + 1}`;
    markers.set(evidenceId, marker);
    if (record) orderedEvidence.push(record);
    return marker;
  };

  for (const section of TAILORED_SECTIONS) {
    const sectionItems = input.items.filter((item) => item.section === section);
    if (sectionItems.length === 0) continue;
    ensure(40);
    text((tailoredSectionLabel[section] ?? section).toUpperCase(), { size: 11, style: "bold" });
    rule();

    let lastHeading: string | null = null;
    for (const item of sectionItems) {
      if (item.heading && item.heading !== lastHeading) {
        ensure(20);
        text(item.heading, { size: 10, style: "bold" });
        lastHeading = item.heading;
      }
      const citationMarkers = item.sources.map(
        (source) => `${markerFor(source.resume_evidence_id)}${source.support_type === "primary" ? "" : "~"}`,
      );
      const statusMark = input.supportedOnly
        ? ""
        : ` [${(validationStatusLabel[item.validationStatus] ?? item.validationStatus).toUpperCase()}]`;
      text(
        `•  ${item.statement}${citationMarkers.length ? `  [${citationMarkers.join(", ")}]` : "  [NO CITATION]"}${statusMark}`,
        { size: 10, indent: 8 },
      );
      y += 3;
    }
    y += 8;
  }

  // Evidence appendix
  doc.addPage();
  y = MARGIN;
  text("EVIDENCE APPENDIX — PROVENANCE FOR EVERY CLAIM", { size: 12, style: "bold" });
  text(
    "Each marker above maps to one master resume evidence record below, identified by its evidence ID. A tilde (~) marks related-but-not-exact support. Nothing in this resume was written from any other source, and the master resume itself was never altered.",
    { size: 8, color: [90, 90, 96], gap: 6 },
  );
  rule();

  for (const record of orderedEvidence) {
    const marker = markers.get(record.id)!;
    ensure(50);
    text(
      `${marker} · ${[record.category, record.role, record.organization, record.title].filter(Boolean).join(" · ")}`,
      { size: 9.5, style: "bold" },
    );
    const dates = [record.start_date, record.end_date].filter(Boolean).join(" – ");
    text(`evidence id ${record.id}${dates ? ` · ${dates}` : ""}`, { size: 7.5, color: [120, 120, 126] });
    text(record.content, { size: 8.5, color: [50, 50, 56], indent: 8, gap: 8 });
  }
  if (orderedEvidence.length === 0) {
    text("No evidence records are cited in this export.", { size: 9, color: [120, 120, 126] });
  }

  const slug = [input.profile?.full_name, input.jobTitle, input.jobCompany]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const fileName = `${slug || "tailored-resume"}-v${input.version}${input.supportedOnly ? "-validated" : "-draft"}.pdf`;

  return { blob: doc.output("blob") as Blob, fileName };
}
