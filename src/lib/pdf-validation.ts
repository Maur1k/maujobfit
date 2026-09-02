/**
 * Authoritative PDF checks for uploaded resumes.
 *
 * Browser-reported MIME types and file extensions are attacker-controlled, so
 * every upload is validated from its actual bytes before it is parsed, sent to
 * the AI extractor, or kept in storage. The same module runs client-side for
 * fast feedback and server-side as the enforcement point.
 */
export const PDF_MIME_TYPE = "application/pdf";
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
/** Smaller than any real PDF: header + xref + trailer + one page object. */
const MIN_PDF_BYTES = 400;

export type PdfValidationResult = { ok: true; version: string } | { ok: false; error: string };

const decoder = new TextDecoder("latin1");

function ascii(bytes: Uint8Array, start: number, end: number) {
  return decoder.decode(bytes.subarray(Math.max(0, start), Math.min(bytes.length, end)));
}

/** True only for the exact `application/pdf` media type (parameters allowed). */
export function isPdfMimeType(value: string | null | undefined) {
  if (!value) return false;
  return value.split(";")[0]!.trim().toLowerCase() === PDF_MIME_TYPE;
}

export function validatePdfBytes(bytes: Uint8Array): PdfValidationResult {
  if (bytes.length < MIN_PDF_BYTES) {
    return { ok: false, error: "That file is too small to be a real PDF. Export your resume again and retry." };
  }
  if (bytes.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: "That file is larger than 15 MB. Please upload a smaller PDF." };
  }

  // The signature must sit at byte 0. A `%PDF-` marker further in is the classic
  // polyglot shape (e.g. a ZIP/HTML/script file with a PDF appended).
  const head = ascii(bytes, 0, 1024);
  const match = /^%PDF-(\d\.\d)/.exec(head);
  if (!match) {
    if (head.includes("%PDF-")) {
      return {
        ok: false,
        error: "This file only pretends to be a PDF — its content starts with something else. Upload a real PDF export.",
      };
    }
    return { ok: false, error: "This is not a PDF file. Export your resume as a PDF and try again." };
  }

  // Structural sanity: a conforming PDF ends with %%EOF and carries a
  // cross-reference section plus a document catalog.
  const tail = ascii(bytes, bytes.length - 4096, bytes.length);
  if (!tail.includes("%%EOF")) {
    return { ok: false, error: "This PDF looks truncated or corrupted (no end-of-file marker). Export it again and retry." };
  }
  if (!tail.includes("startxref")) {
    return { ok: false, error: "This PDF is missing its cross-reference table, so it cannot be read. Export it again and retry." };
  }

  const body = ascii(bytes, 0, bytes.length);
  if (!body.includes("/Root") && !body.includes("/Catalog")) {
    return { ok: false, error: "This PDF has no readable document structure. Export it again and retry." };
  }
  if (!/\/(?:XRef|ObjStm)\b/.test(body) && !/\bxref\b/.test(body)) {
    return { ok: false, error: "This PDF is malformed and cannot be parsed safely. Export it again and retry." };
  }

  return { ok: true, version: match[1]! };
}
