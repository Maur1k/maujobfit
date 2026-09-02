import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMPORT_SECTIONS } from "@/lib/resume-import";
import { MAX_IMPORT_BYTES, isPdfMimeType, validatePdfBytes } from "@/lib/pdf-validation";


const extractionSchema = z.object({
  profile: z
    .object({
      full_name: z.string().nullish(),
      headline: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      location: z.string().nullish(),
      portfolio_url: z.string().nullish(),
      github_url: z.string().nullish(),
      linkedin_url: z.string().nullish(),
    })
    .default({}),
  summary: z.string().nullish(),
  items: z
    .array(
      z.object({
        section: z.string(),
        title: z.string().nullish(),
        organization: z.string().nullish(),
        role: z.string().nullish(),
        location: z.string().nullish(),
        start_date: z.string().nullish(),
        end_date: z.string().nullish(),
        url: z.string().nullish(),
        description: z.string().nullish(),
        skills: z.array(z.string()).default([]),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = `You convert raw resume text into structured JSON for review. Rules:
- Copy wording from the source. Never invent, embellish or infer achievements, dates, employers or metrics.
- If a value is absent, use null. Never guess.
- Keep every accomplishment bullet as its own string, verbatim (you may fix broken line-wrapping and stray hyphenation only).
- Allowed section values: experience, project, skill, education, certification, link.
- "skill" entries group related skills: title = group name (e.g. "Languages"), skills = the list, no bullets.
- "link" entries: title = label, url = the URL.
- Dates stay as written in the document (e.g. "May 2026", "Present").
Return ONLY JSON matching:
{"profile":{"full_name":null,"headline":null,"email":null,"phone":null,"location":null,"portfolio_url":null,"github_url":null,"linkedin_url":null},"summary":null,"items":[{"section":"experience","title":null,"organization":null,"role":null,"location":null,"start_date":null,"end_date":null,"url":null,"description":null,"skills":[],"bullets":[]}]}`;

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response was not valid JSON.");
  return body.slice(start, end + 1);
}

async function extractPdfText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { pageCount: totalPages, text: Array.isArray(text) ? text.join("\n") : text };
}

export const parseResumeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { importId: string }) => z.object({ importId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row, error: rowError } = await supabase
      .from("resume_imports")
      .select("id, file_path, file_name, mime_type")
      .eq("id", data.importId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row?.file_path) throw new Error("Upload not found.");

    const fail = async (message: string) => {
      await supabase
        .from("resume_imports")
        .update({ status: "failed", error_message: message })
        .eq("id", data.importId);
      return { ok: false as const, error: message };
    };

    // Reject a rejected upload's bytes so nothing unvalidated is retained.
    const rejectFile = async (message: string) => {
      await supabase.storage.from("resume-imports").remove([row.file_path!]);
      await supabase.from("resume_imports").update({ file_path: null }).eq("id", data.importId);
      return fail(message);
    };

    // The declared type is client-supplied; treat anything else as a rejection.
    if (!isPdfMimeType(row.mime_type)) {
      return rejectFile("Only PDF resumes are supported. Export your resume as a PDF and try again.");
    }

    await supabase
      .from("resume_imports")
      .update({ status: "parsing", error_message: null })
      .eq("id", data.importId);

    const download = await supabase.storage.from("resume-imports").download(row.file_path);
    if (download.error || !download.data) {
      return fail("We couldn't read the uploaded file. Try uploading it again.");
    }
    if (download.data.size > MAX_IMPORT_BYTES) {
      return rejectFile("That file is larger than 15 MB. Please upload a smaller PDF.");
    }

    // Authoritative byte-level validation, before any extraction or AI call.
    const buffer = new Uint8Array(await download.data.arrayBuffer());
    const signature = validatePdfBytes(buffer);
    if (!signature.ok) {
      return rejectFile(signature.error);
    }

    let text = "";
    let pageCount: number | null = null;
    try {
      const result = await extractPdfText(buffer);
      text = (result.text ?? "").replace(/\u0000/g, "").trim();
      pageCount = result.pageCount ?? null;
    } catch {
      return fail(
        "This PDF couldn't be opened. It may be corrupted or password protected — try exporting it again.",
      );

    }

    if (text.replace(/\s+/g, "").length < 120) {
      return fail(
        "No selectable text found. This looks like a scanned or image-only PDF; upload a text-based export instead.",
      );
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return fail("AI extraction is not configured for this project.");

    let parsed: z.infer<typeof extractionSchema>;
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Resume text:\n\n${text.slice(0, 60000)}` },
          ],
        }),
      });
      if (response.status === 429) {
        return fail("The AI service is rate limited right now. Wait a moment and retry parsing.");
      }
      if (!response.ok) {
        return fail("The AI service could not process this document. Please retry.");
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      parsed = extractionSchema.parse(JSON.parse(stripFence(content)));
    } catch {
      return fail("We couldn't structure this resume. Please retry, or add the entries manually.");
    }

    await supabase.from("resume_import_items").delete().eq("resume_import_id", data.importId);

    const rows = parsed.items
      .filter((item) => IMPORT_SECTIONS.includes(item.section as never))
      .map((item, index) => ({
        user_id: userId,
        resume_import_id: data.importId,
        section: item.section,
        title: item.title ?? null,
        organization: item.organization ?? null,
        role: item.role ?? null,
        location: item.location ?? null,
        start_date: item.start_date ?? null,
        end_date: item.end_date ?? null,
        url: item.url ?? null,
        description: item.description ?? null,
        skills: item.skills.filter((s) => s.trim().length > 0),
        bullets: item.bullets
          .filter((b) => b.trim().length > 0)
          .map((content, i) => ({ id: `b${i}`, content: content.trim(), status: "accepted" })),
        status: "pending",
        sort_order: index,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("resume_import_items").insert(rows);
      if (insertError) return fail(insertError.message);
    }

    const summary = parsed.summary?.trim() || null;

    const { error: updateError } = await supabase
      .from("resume_imports")
      .update({
        status: "ready",
        error_message: null,
        raw_text: text,
        page_count: pageCount,
        parsed_profile: parsed.profile ?? {},
        parsed_summary: summary,
        summary_status: "pending",
        profile_status: "pending",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", data.importId);
    if (updateError) return fail(updateError.message);

    return { ok: true as const, itemCount: rows.length, pageCount };
  });
