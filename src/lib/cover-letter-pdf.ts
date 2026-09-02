import { jsPDF } from "jspdf";

import { PAGE_DIMENSIONS, type ProProfile } from "@/lib/resume-pdf-professional";

/**
 * Recruiter-facing cover-letter renderer.
 *
 * Matches the Professional Resume visual language (same margins, ink/muted palette,
 * Helvetica hierarchy, letter-spaced target line and header rule). Like the resume,
 * it NEVER emits evidence ids, citations, statuses, confidence, provenance or any
 * other internal metadata — it receives already-reviewed text only.
 */

export type BuildCoverLetterPdfInput = {
  profile: ProProfile;
  jobTitle: string | null;
  jobCompany: string | null;
  recipient: string | null;
  greeting: string;
  body: string[];
  signoff: string;
  date?: Date;
  paperSize?: "a4" | "letter";
};

const INK: [number, number, number] = [22, 22, 26];
const MUTED: [number, number, number] = [102, 102, 110];

export function buildCoverLetterPdf(input: BuildCoverLetterPdfInput) {
  const paperSize = input.paperSize ?? "letter";
  const { width: PAGE_W, height: PAGE_H } = PAGE_DIMENSIONS[paperSize];
  const MARGIN_X = 52;
  const MARGIN_Y = 48;
  const BODY_W = PAGE_W - MARGIN_X * 2;

  const doc = new jsPDF({ unit: "pt", format: paperSize, compress: true });
  let y = MARGIN_Y;

  const setFont = (size: number, style: "normal" | "bold" | "italic" = "normal", color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN_Y) {
      doc.addPage();
      y = MARGIN_Y;
    }
  };

  const block = (
    value: string,
    opts: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      color?: [number, number, number];
      leading?: number;
      gap?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10.2;
    const style = opts.style ?? "normal";
    const leading = opts.leading ?? size * 1.5;
    setFont(size, style, opts.color ?? INK);
    const lines = doc.splitTextToSize(value, BODY_W) as string[];
    for (const line of lines) {
      ensure(leading);
      setFont(size, style, opts.color ?? INK);
      doc.text(line, MARGIN_X, y + size);
      y += leading;
    }
    y += opts.gap ?? 0;
  };

  // ---------- Header (same hierarchy as the professional resume) ----------
  const name = (input.profile?.full_name || "").trim() || "Cover Letter";
  setFont(21, "bold");
  doc.setCharSpace(0.4);
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
    block(line.join("   ·   "), { size: 9, color: MUTED, leading: 12.5 });
  }

  y += 6;
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(1);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  doc.setLineWidth(0.7);
  y += 18;

  // ---------- Date & addressee ----------
  const date = (input.date ?? new Date()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  block(date, { size: 9.4, color: MUTED, leading: 13, gap: 6 });

  const addressee = [
    input.recipient || input.jobCompany,
    input.jobTitle ? `Re: ${input.jobTitle}` : null,
  ].filter(Boolean) as string[];
  for (const line of addressee)
    block(line, { size: 10, style: line.startsWith("Re:") ? "normal" : "bold", leading: 13.5 });
  if (addressee.length) y += 8;

  // ---------- Letter ----------
  block(input.greeting.trim() || "Dear Hiring Manager,", { size: 10.2, leading: 15, gap: 8 });
  for (const paragraph of input.body) {
    block(paragraph, { size: 10.2, leading: 15.4, gap: 10 });
  }

  y += 4;
  block(input.signoff.trim() || "Sincerely,", { size: 10.2, leading: 15, gap: 16 });
  block((input.profile?.full_name || "").trim(), { size: 10.6, style: "bold", leading: 14 });

  const slug = [input.profile?.full_name, input.jobTitle, input.jobCompany]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return {
    blob: doc.output("blob") as Blob,
    fileName: `${slug || "cover-letter"}-cover-letter.pdf`,
  };
}
