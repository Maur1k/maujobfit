import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { containsMetric, metricTokens, overlapRatio } from "@/lib/validation";
import { captureSnapshot } from "@/lib/versions.functions";
import type { CoverLetterParagraph } from "@/lib/cover-letter";

const letterSchema = z.object({
  possible: z.boolean().default(true),
  greeting: z.string().default("Dear Hiring Manager,"),
  opening: z.string().default(""),
  paragraphs: z
    .array(
      z.object({
        text: z.string(),
        evidence_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  closing: z.string().default(""),
  signoff: z.string().default("Sincerely,"),
  rationale: z.string().default(""),
});

const LETTER_PROMPT = `You draft a concise, professional cover letter from a candidate's ALREADY VALIDATED resume claims and the evidence behind them.
Absolute rules:
- Every factual sentence must be traceable to the supplied evidence. Never invent employers, projects, tools, dates, metrics, titles or outcomes.
- Never restate a related-but-not-equal technology as the job's term (e.g. keep "Laravel/PHP" as-is).
- No fabricated enthusiasm or invented personal history: no "I have always dreamed of", no claims about admiring the company, no volunteering, no relocation, no salary.
- Do not claim any skill the evidence does not show. Silence is better than a guess.
- Reuse the evidence's own numbers only; introduce no new figures.
- Structure: opening (why this role, grounded in the candidate's actual background), 2-3 body paragraphs each anchored to specific evidence, a short closing that offers next steps.
- 250-330 words total. Plain professional English, no bullet lists, no headings, no markdown.
- Each body paragraph must cite the evidence ids it draws on.
- If the supplied evidence cannot support a defensible letter for this job, set possible=false and explain why in rationale.
Return ONLY JSON: {"possible":true,"greeting":"...","opening":"...","paragraphs":[{"text":"...","evidence_ids":["id"]}],"closing":"...","signoff":"Sincerely,","rationale":"..."}`;

async function callGateway(messages: { role: string; content: string }[]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.7-flash", messages }),
  });
  if (!response.ok) {
    console.error(`AI gateway failed [${response.status}]: ${await response.text()}`);
    return null;
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  const match = /\{[\s\S]*\}/.exec(content);
  return match ? match[0] : null;
}

type EvidenceRecord = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  content: string;
  skills: string[] | null;
};

function evidenceText(row: EvidenceRecord) {
  return [row.role, row.organization, row.title, row.content, (row.skills ?? []).join(" ")].filter(Boolean).join(" · ");
}

/**
 * Deterministic claim check for one cover-letter paragraph against ONLY the evidence
 * already linked to it. No new evidence is ever attached here.
 */
function assessParagraph(text: string, linked: EvidenceRecord[]) {
  const spans: string[] = [];
  if (linked.length === 0) {
    return {
      status: "needs_review",
      rationale: "This paragraph has no stored evidence linked to it, so nothing substantiates its wording.",
      spans,
    };
  }
  const corpus = linked.map(evidenceText).join("\n");
  const unmatched = metricTokens(text).filter((metric) => !containsMetric(corpus, metric));
  if (unmatched.length > 0) {
    return {
      status: "unsupported",
      rationale: `The paragraph states figures (${unmatched.join(", ")}) that the linked evidence does not contain.`,
      spans: unmatched,
    };
  }
  const overlap = overlapRatio(text, corpus);
  if (overlap >= 0.45) {
    return {
      status: "supported",
      rationale: "The wording traces back to the linked evidence.",
      spans,
    };
  }
  if (overlap >= 0.25) {
    return {
      status: "partially_supported",
      rationale: "Only part of the wording traces back to the linked evidence — tighten it to what the evidence states.",
      spans,
    };
  }
  return {
    status: "needs_review",
    rationale: "Little of this wording traces back to the linked evidence. Rewrite it closer to what your evidence actually says.",
    spans,
  };
}

function rollUp(paragraphs: { status: string }[]) {
  if (paragraphs.some((row) => row.status === "unsupported")) return "unsupported";
  if (paragraphs.some((row) => row.status === "needs_review")) return "needs_review";
  if (paragraphs.some((row) => row.status === "partially_supported")) return "partially_supported";
  return paragraphs.length ? "supported" : "pending";
}

export const generateCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tailoredResumeId: string }) =>
    z.object({ tailoredResumeId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const { data: resume, error: resumeError } = await supabase
      .from("tailored_resumes")
      .select("id, job_id, version")
      .eq("id", data.tailoredResumeId)
      .maybeSingle();
    if (resumeError) return fail(resumeError.message);
    if (!resume) return fail("That tailored resume could not be found.");
    if (!resume.job_id) return fail("This tailored resume is not linked to a saved job description.");

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, company, seniority, keywords, raw_text")
      .eq("id", resume.job_id)
      .maybeSingle();
    if (jobError) return fail(jobError.message);
    if (!job) return fail("The target job description could not be found.");

    const { data: itemRows, error: itemsError } = await supabase
      .from("tailored_resume_items")
      .select("id, section, heading, statement, validation_status, sort_order")
      .eq("tailored_resume_id", resume.id)
      .order("sort_order", { ascending: true });
    if (itemsError) return fail(itemsError.message);
    const supported = (itemRows ?? []).filter((row) => row.validation_status === "supported");
    if (supported.length === 0) {
      return fail(
        "No claim in this resume is validated as supported yet, so there is nothing defensible to write a cover letter from. Validate the resume and resolve the flagged claims first.",
      );
    }

    const { data: sourceRows, error: sourcesError } = await supabase
      .from("tailored_resume_item_sources")
      .select("tailored_resume_item_id, resume_evidence_id, support_type")
      .eq("user_id", userId)
      .in(
        "tailored_resume_item_id",
        supported.map((row) => row.id),
      );
    if (sourcesError) return fail(sourcesError.message);
    const evidenceIds = [...new Set((sourceRows ?? []).map((row) => row.resume_evidence_id).filter(Boolean))] as string[];
    if (evidenceIds.length === 0) {
      return fail("The supported claims have no stored evidence linked, so no defensible cover letter can be written.");
    }

    const { data: evidenceRows, error: evidenceError } = await supabase
      .from("resume_evidence")
      .select("id, category, title, organization, role, start_date, end_date, content, skills")
      .in("id", evidenceIds);
    if (evidenceError) return fail(evidenceError.message);
    const evidence = (evidenceRows ?? []) as EvidenceRecord[];
    const evidenceById = new Map(evidence.map((row) => [row.id, row]));

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, headline, location")
      .eq("id", userId)
      .maybeSingle();

    const raw = await callGateway([
      { role: "system", content: LETTER_PROMPT },
      {
        role: "user",
        content: [
          `Candidate: ${profile?.full_name ?? "the candidate"}${profile?.headline ? ` — ${profile.headline}` : ""}`,
          `Target role: ${[job.title, job.company].filter(Boolean).join(" at ")}${job.seniority ? ` (${job.seniority})` : ""}`,
          `Job keywords: ${(job.keywords ?? []).join(", ") || "none recorded"}`,
          "",
          "Job posting (context only — never claim anything from here):",
          (job.raw_text ?? "").slice(0, 6000) || "not stored",
          "",
          "Validated resume claims (all already substantiated):",
          ...supported.map((row) => `- [${row.section}] ${row.heading ? `${row.heading}: ` : ""}${row.statement}`),
          "",
          "Evidence records (the ONLY permitted source of facts):",
          ...evidence.map((row) => `- id=${row.id} | ${evidenceText(row)}`),
        ].join("\n"),
      },
    ]).catch(() => null);

    if (!raw) return fail("The cover-letter service is unavailable right now. Please retry.");

    let parsed: z.infer<typeof letterSchema>;
    try {
      parsed = letterSchema.parse(JSON.parse(raw));
    } catch {
      return fail("We couldn't read the generated cover letter. Please retry.");
    }

    if (!parsed.possible || parsed.paragraphs.length === 0) {
      return fail(
        parsed.rationale.trim() ||
          "No defensible cover letter could be written from the evidence behind your supported claims. Strengthen your master resume evidence and retry.",
      );
    }

    const paragraphs: CoverLetterParagraph[] = parsed.paragraphs
      .map((row, index) => {
        const linkedIds = row.evidence_ids.filter((id) => evidenceById.has(id));
        const linked = linkedIds.map((id) => evidenceById.get(id)!);
        const assessment = assessParagraph(row.text.trim(), linked);
        return {
          id: `p${index + 1}`,
          text: row.text.trim(),
          evidence_ids: linkedIds,
          status: assessment.status,
          rationale: assessment.rationale,
          unsupported_spans: assessment.spans,
        };
      })
      .filter((row) => row.text.length > 0)
      // a paragraph whose figures contradict its own evidence is dropped, never shipped
      .filter((row) => row.status !== "unsupported");

    if (paragraphs.length === 0) {
      return fail(
        "Every generated paragraph introduced claims your evidence does not support, so nothing was saved. Please retry — or strengthen your master resume evidence first.",
      );
    }

    const openingCorpus = evidence.map(evidenceText).join("\n");
    const openingMetrics = metricTokens(parsed.opening).filter((metric) => !containsMetric(openingCorpus, metric));
    const opening = openingMetrics.length ? "" : parsed.opening.trim();

    const { data: inserted, error: insertError } = await supabase
      .from("cover_letters")
      .insert({
        user_id: userId,
        tailored_resume_id: resume.id,
        job_id: job.id,
        status: "draft",
        recipient: job.company ?? null,
        greeting: parsed.greeting.trim() || "Dear Hiring Manager,",
        opening: opening || paragraphs[0]!.text,
        paragraphs: opening ? paragraphs : paragraphs.slice(1),
        closing: parsed.closing.trim(),
        signoff: parsed.signoff.trim() || "Sincerely,",
        validation_status: rollUp(paragraphs),
        validation_notes: paragraphs
          .filter((row) => row.status !== "supported")
          .map((row) => ({ paragraph_id: row.id, message: row.rationale })),
        notes: parsed.rationale.trim() || null,
      })
      .select("id")
      .maybeSingle();
    if (insertError) return fail(insertError.message);

    try {
      await captureSnapshot({ supabase, userId }, {
        tailoredResumeId: resume.id,
        reason: "cover_letter",
        label: `v${resume.version} · cover letter drafted`,
        notes: "Cover letter drafted from the supported claims.",
      });
    } catch {
      // best effort
    }

    return {
      ok: true as const,
      coverLetterId: inserted?.id ?? null,
      paragraphCount: paragraphs.length,
      validationStatus: rollUp(paragraphs),
    };
  });

/** Saves user edits and re-checks each paragraph against its EXISTING linked evidence only. */
export const saveCoverLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      coverLetterId: string;
      greeting: string;
      opening: string;
      paragraphs: { id: string; text: string }[];
      closing: string;
      signoff: string;
      recipient?: string | null;
    }) =>
      z
        .object({
          coverLetterId: z.string().uuid(),
          greeting: z.string().trim().max(200),
          opening: z.string().trim().max(2000),
          paragraphs: z
            .array(z.object({ id: z.string().min(1), text: z.string().trim().max(2500) }))
            .max(8),
          closing: z.string().trim().max(2000),
          signoff: z.string().trim().max(80),
          recipient: z.string().trim().max(200).nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const { data: letter, error: letterError } = await supabase
      .from("cover_letters")
      .select("id, tailored_resume_id, paragraphs, opening")
      .eq("id", data.coverLetterId)
      .maybeSingle();
    if (letterError) return fail(letterError.message);
    if (!letter) return fail("That cover letter could not be found.");

    const stored = (letter.paragraphs ?? []) as CoverLetterParagraph[];
    const storedById = new Map(stored.map((row) => [row.id, row]));
    const evidenceIds = [...new Set(stored.flatMap((row) => row.evidence_ids))];

    const { data: evidenceRows, error: evidenceError } = evidenceIds.length
      ? await supabase
          .from("resume_evidence")
          .select("id, category, title, organization, role, start_date, end_date, content, skills")
          .in("id", evidenceIds)
      : { data: [], error: null };
    if (evidenceError) return fail(evidenceError.message);
    const evidenceById = new Map(((evidenceRows ?? []) as EvidenceRecord[]).map((row) => [row.id, row]));

    const paragraphs: CoverLetterParagraph[] = data.paragraphs
      .filter((row) => row.text.trim().length > 0)
      .map((row) => {
        const previous = storedById.get(row.id);
        // evidence links are preserved exactly — never added or substituted here
        const linkedIds = previous?.evidence_ids ?? [];
        const linked = linkedIds.map((id) => evidenceById.get(id)).filter(Boolean) as EvidenceRecord[];
        const assessment = assessParagraph(row.text.trim(), linked);
        return {
          id: row.id,
          text: row.text.trim(),
          evidence_ids: linkedIds,
          status: assessment.status,
          rationale: assessment.rationale,
          unsupported_spans: assessment.spans,
        };
      });

    const validationStatus = rollUp(paragraphs);

    const { error: updateError } = await supabase
      .from("cover_letters")
      .update({
        greeting: data.greeting || "Dear Hiring Manager,",
        opening: data.opening,
        paragraphs,
        closing: data.closing,
        signoff: data.signoff || "Sincerely,",
        recipient: data.recipient ?? null,
        status: "reviewed",
        validation_status: validationStatus,
        validation_notes: paragraphs
          .filter((row) => row.status !== "supported")
          .map((row) => ({ paragraph_id: row.id, message: row.rationale })),
      })
      .eq("id", letter.id);
    if (updateError) return fail(updateError.message);

    return {
      ok: true as const,
      validationStatus,
      flagged: paragraphs.filter((row) => row.status !== "supported").length,
      paragraphs,
    };
  });
