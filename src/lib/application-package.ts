import { PDFDocument } from "pdf-lib";

/**
 * Merges already-rendered PDF blobs (cover letter, then resume) into a single
 * application package. Purely a container operation: page content is copied
 * byte-for-byte, so nothing is rewritten, re-styled or re-worded.
 */
export async function mergePdfBlobs(parts: Blob[], fileName: string) {
  const usable = parts.filter((part) => part.size > 0);
  if (usable.length === 0) throw new Error("There is nothing to merge into a package yet.");
  if (usable.length === 1) return { blob: usable[0]!, fileName };

  const merged = await PDFDocument.create();
  for (const part of usable) {
    const source = await PDFDocument.load(await part.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  const bytes = await merged.save();
  return {
    blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    fileName,
  };
}

export function slugifyForFile(parts: (string | null | undefined)[]) {
  return parts
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
