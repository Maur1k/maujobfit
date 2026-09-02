import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capStatus,
  containsMetric,
  metricTokens,
  normaliseForCompare,
  overlapRatio,
  severityFor,
  type ValidationStatus,
} from "@/lib/validation";

const aiSchema = z.object({
  results: z
    .array(
      z.object({
        index: z.number(),
        status: z.enum(["supported", "partially_supported", "unsupported", "needs_review"]),
        rationale: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.5),
        unsupported_spans: z.array(z.string()).default([]),
        issues: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const rewriteSchema = z.object({
  possible: z.boolean(),
  statement: z.string().default(""),
  removed: z.array(z.string()).default([]),
  rationale: z.string().default(""),
});

const SYSTEM_PROMPT = `You are a strict claim validator for resumes. You judge ONLY whether each claim is substantiated by the evidence excerpts supplied with it.
Rules:
- Never assume, infer or fabricate support. If the evidence does not state it, it is not supported.
- A citation existing is NOT support. The evidence must substantiate the exact wording, scope, metric, technology, employer/project and timeframe of the claim.
- supported: every factual element of the claim appears in the evidence.
- partially_supported: the core is in the evidence but some element (a metric, a scope word, a technology, a timeframe) is not.
- unsupported: the claim's central fact is absent from the evidence, or the evidence describes something different.
- needs_review: the evidence is too vague or ambiguous to decide.
- unsupported_spans: quote verbatim only the substrings of the claim that the evidence does not substantiate.
- issues: choose from missing_citation, invalid_citation, unsupported_metric, unsupported_span, altered_fact, timeframe_mismatch, overstatement.
- Skill claims are supported only if the skill is named in the evidence.
Return ONLY JSON: {"results":[{"index":0,"status":"supported","rationale":"","confidence":0.9,"unsupported_spans":[],"issues":[]}]}`;

const REWRITE_PROMPT = `You rewrite a single flagged resume claim so that it is fully substantiated by the evidence supplied with it.
Absolute rules:
- Use ONLY facts present in the supplied evidence. Never add employers, tools, metrics, dates, scope or achievements.
- Remove any wording the evidence does not substantiate instead of guessing or softening it into a vaguer claim that is still unsupported.
- Keep the candidate's own terminology. Keep it to one sentence (two for a summary), strong verb first.
- If nothing defensible remains after removing unsupported wording, set possible to false.
- removed: list the specific phrases you dropped and why they were dropped.
Return ONLY JSON: {"possible":true,"statement":"","removed":[""],"rationale":""}`;

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response was not valid JSON.");
  return body.slice(start, end + 1);
}

async function callGateway(messages: { role: string; content: string }[]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.7-flash", messages }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return stripFence(payload.choices?.[0]?.message?.content ?? "");
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
  skills: string[];
};

type ItemRecord = {
  id: string;
  section: string;
  heading: string | null;
  statement: string;
  source_text: string | null;
  sort_order: number;
};

function evidenceText(row: EvidenceRecord) {
  return [row.role, row.title, row.organization, row.start_date, row.end_date, row.content, row.skills.join(", ")]
    .filter(Boolean)
    .join(" | ");
}

type Assessment = {
  itemId: string;
  statement: string;
  ceiling: ValidationStatus;
  status: ValidationStatus;
  rationale: string;
  confidence: number;
  issues: string[];
  spans: string[];
  evidenceIds: string[];
  excerpts: string[];
  validator: string;
};

type Ctx = {
  supabase: any;
  userId: string;
};

/** Loads the stored citations + evidence for the given items. Never adds or substitutes evidence. */
async function loadCitations(ctx: Ctx, itemIds: string[]) {
  const { data: sourceRows, error: sourcesError } = await ctx.supabase
    .from("tailored_resume_item_sources")
    .select("id, tailored_resume_item_id, resume_evidence_id, support_type, excerpt")
    .in("tailored_resume_item_id", itemIds);
  if (sourcesError) throw new Error(sourcesError.message);
  const sources = (sourceRows ?? []) as {
    id: string;
    tailored_resume_item_id: string;
    resume_evidence_id: string | null;
    support_type: string;
    excerpt: string | null;
  }[];

  const evidenceIds = [...new Set(sources.map((row) => row.resume_evidence_id).filter(Boolean))] as string[];
  const { data: evidenceRows, error: evidenceError } = evidenceIds.length
    ? await ctx.supabase
        .from("resume_evidence")
        .select("id, category, title, organization, role, start_date, end_date, content, skills")
        .in("id", evidenceIds)
    : { data: [], error: null };
  if (evidenceError) throw new Error(evidenceError.message);
  const evidenceById = new Map(((evidenceRows ?? []) as EvidenceRecord[]).map((row) => [row.id, row]));
  return { sources, evidenceById };
}

function deterministicAssessment(
  item: ItemRecord,
  itemSources: { resume_evidence_id: string | null; excerpt: string | null }[],
  evidenceById: Map<string, EvidenceRecord>,
) {
  const cited = itemSources
    .map((row) => (row.resume_evidence_id ? evidenceById.get(row.resume_evidence_id) : undefined))
    .filter(Boolean) as EvidenceRecord[];
  const issues: string[] = [];
  const spans: string[] = [];
  let ceiling: ValidationStatus = "supported";

  if (itemSources.length === 0) {
    issues.push("missing_citation");
    ceiling = "unsupported";
  } else if (cited.length < itemSources.length) {
    issues.push("invalid_citation");
    ceiling = cited.length === 0 ? "unsupported" : "partially_supported";
  }

  const corpus = [...cited.map(evidenceText), item.source_text ?? "", ...itemSources.map((row) => row.excerpt ?? "")]
    .filter(Boolean)
    .join("\n");

  const unmatchedMetrics = metricTokens(item.statement).filter((metric) => !containsMetric(corpus, metric));
  if (unmatchedMetrics.length > 0) {
    issues.push("unsupported_metric");
    spans.push(...unmatchedMetrics);
    ceiling = capStatus(ceiling, "unsupported");
  }

  if (item.heading) {
    const headingParts = item.heading
      .split(/[—|,–-]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 2);
    const missingParts = headingParts.filter(
      (part) => !normaliseForCompare(corpus).includes(normaliseForCompare(part)),
    );
    if (missingParts.length > 0) {
      issues.push("altered_fact");
      spans.push(...missingParts);
      ceiling = capStatus(ceiling, "partially_supported");
    }
  }

  const ratio = corpus ? overlapRatio(item.statement, corpus) : 0;
  if (corpus && ratio < 0.35) {
    issues.push("weak_overlap");
    ceiling = capStatus(ceiling, "needs_review");
  }

  const assessment: Assessment = {
    itemId: item.id,
    statement: item.statement,
    ceiling,
    status: ceiling === "supported" ? (ratio >= 0.7 ? "supported" : "partially_supported") : ceiling,
    rationale:
      itemSources.length === 0
        ? "No citation is stored for this claim, so nothing substantiates it."
        : `Deterministic check: ${Math.round(ratio * 100)}% of the claim's wording traces back to the cited evidence.`,
    confidence: 0.4,
    issues: [...new Set(issues)],
    spans: [...new Set(spans)],
    evidenceIds: cited.map((row) => row.id),
    excerpts: cited.map((row) => row.content.slice(0, 400)),
    validator: "deterministic",
  };
  return { assessment, cited };
}

async function runValidation(ctx: Ctx, resumeId: string, items: ItemRecord[]) {
  const { sources, evidenceById } = await loadCitations(
    ctx,
    items.map((row) => row.id),
  );

  const assessments: Assessment[] = [];
  const aiCandidates: { index: number; assessmentIndex: number; prompt: string }[] = [];

  for (const item of items) {
    const itemSources = sources.filter((row) => row.tailored_resume_item_id === item.id);
    const { assessment, cited } = deterministicAssessment(item, itemSources, evidenceById);
    assessments.push(assessment);
    if (cited.length > 0) {
      aiCandidates.push({
        index: aiCandidates.length,
        assessmentIndex: assessments.length - 1,
        prompt: `#${aiCandidates.length} [${item.section}]${item.heading ? ` heading: ${item.heading}` : ""}\nclaim: ${item.statement}\nevidence:\n${cited
          .map((row) => `  - ${evidenceText(row)}`)
          .join("\n")}`,
      });
    }
  }

  let aiUsed = false;
  if (aiCandidates.length > 0) {
    try {
      const raw = await callGateway([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Validate each claim against ONLY its own evidence.\n\n${aiCandidates.map((row) => row.prompt).join("\n\n")}`,
        },
      ]);
      if (raw) {
        const parsed = aiSchema.parse(JSON.parse(raw));
        aiUsed = true;
        for (const result of parsed.results) {
          const candidate = aiCandidates.find((row) => row.index === result.index);
          if (!candidate) continue;
          const target = assessments[candidate.assessmentIndex]!;
          const statement = target.statement.toLowerCase();
          const verifiedSpans = result.unsupported_spans
            .map((span) => span.trim())
            .filter((span) => span.length > 0 && statement.includes(span.toLowerCase()));
          target.status = capStatus(result.status, target.ceiling);
          target.rationale = result.rationale.trim() || target.rationale;
          target.confidence = Number(result.confidence.toFixed(2));
          target.spans = [...new Set([...target.spans, ...verifiedSpans])];
          target.issues = [
            ...new Set([
              ...target.issues,
              ...result.issues.filter((issue) => /^[a-z_]+$/.test(issue)),
              ...(target.status !== "supported" && verifiedSpans.length > 0 ? ["unsupported_span"] : []),
            ]),
          ];
          target.validator = "ai+deterministic";
        }
      }
    } catch {
      aiUsed = false;
    }
  }

  if (!aiUsed) {
    for (const assessment of assessments) {
      if (assessment.evidenceIds.length > 0) {
        assessment.status = capStatus("needs_review", assessment.ceiling);
        assessment.issues = [...new Set([...assessment.issues, "ai_unavailable"])];
      }
    }
  }

  const { error: deleteError } = await ctx.supabase
    .from("validation_results")
    .delete()
    .eq("tailored_resume_id", resumeId)
    .in(
      "tailored_resume_item_id",
      items.map((row) => row.id),
    );
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await ctx.supabase.from("validation_results").insert(
    assessments.map((assessment) => ({
      user_id: ctx.userId,
      tailored_resume_id: resumeId,
      tailored_resume_item_id: assessment.itemId,
      check_type: "claim_support",
      severity: severityFor(assessment.status),
      passed: assessment.status === "supported",
      message: assessment.rationale,
      status: assessment.status,
      rationale: assessment.rationale,
      confidence: assessment.confidence,
      evidence_ids: assessment.evidenceIds,
      evidence_excerpts: assessment.excerpts,
      unsupported_spans: assessment.spans,
      issues: assessment.issues,
      validator: assessment.validator,
    })),
  );
  if (insertError) throw new Error(insertError.message);

  for (const assessment of assessments) {
    const { error } = await ctx.supabase
      .from("tailored_resume_items")
      .update({ validation_status: assessment.status })
      .eq("id", assessment.itemId);
    if (error) throw new Error(error.message);
  }

  const counts = assessments.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return { assessments, aiUsed, counts };
}

export const validateTailoredResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tailoredResumeId: string }) =>
    z.object({ tailoredResumeId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const { data: resume, error: resumeError } = await supabase
      .from("tailored_resumes")
      .select("id")
      .eq("id", data.tailoredResumeId)
      .maybeSingle();
    if (resumeError) return fail(resumeError.message);
    if (!resume) return fail("That tailored resume could not be found.");

    const { data: itemRows, error: itemsError } = await supabase
      .from("tailored_resume_items")
      .select("id, section, heading, statement, source_text, sort_order")
      .eq("tailored_resume_id", resume.id)
      .order("sort_order", { ascending: true });
    if (itemsError) return fail(itemsError.message);
    const items = (itemRows ?? []) as ItemRecord[];
    if (items.length === 0) return fail("This tailored resume has no items to validate yet.");

    try {
      const result = await runValidation({ supabase, userId }, resume.id, items);
      return {
        ok: true as const,
        tailoredResumeId: resume.id,
        checked: result.assessments.length,
        aiUsed: result.aiUsed,
        counts: result.counts,
      };
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Validation failed. Please retry.");
    }
  });

/** Saves user-edited wording, then re-validates that single item against its EXISTING stored citations. */
export const saveTailoredItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; statement: string; heading?: string | null }) =>
    z
      .object({
        itemId: z.string().uuid(),
        statement: z.string().trim().min(3).max(1200),
        heading: z.string().trim().max(200).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const { data: existing, error: existingError } = await supabase
      .from("tailored_resume_items")
      .select("id, tailored_resume_id, section, heading, statement, source_text, sort_order")
      .eq("id", data.itemId)
      .maybeSingle();
    if (existingError) return fail(existingError.message);
    if (!existing) return fail("That resume item could not be found.");

    const heading = data.heading === undefined ? existing.heading : (data.heading || null);
    const { error: updateError } = await supabase
      .from("tailored_resume_items")
      .update({ statement: data.statement, heading, validation_status: "pending" })
      .eq("id", existing.id);
    if (updateError) return fail(updateError.message);

    const item: ItemRecord = {
      id: existing.id,
      section: existing.section,
      heading,
      statement: data.statement,
      source_text: existing.source_text,
      sort_order: existing.sort_order,
    };

    try {
      const result = await runValidation({ supabase, userId }, existing.tailored_resume_id, [item]);
      return {
        ok: true as const,
        itemId: existing.id,
        status: result.assessments[0]!.status,
        aiUsed: result.aiUsed,
      };
    } catch (error) {
      return fail(error instanceof Error ? error.message : "The item saved but re-validation failed. Please retry.");
    }
  });

/** Proposes a rewrite of one flagged claim using ONLY its already-linked evidence. Nothing is persisted. */
export const proposeTailoredItemRewrite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string }) => z.object({ itemId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const fail = (error: string) => ({ ok: false as const, error });

    const { data: item, error: itemError } = await supabase
      .from("tailored_resume_items")
      .select("id, section, heading, statement, source_text")
      .eq("id", data.itemId)
      .maybeSingle();
    if (itemError) return fail(itemError.message);
    if (!item) return fail("That resume item could not be found.");

    const { data: validation } = await supabase
      .from("validation_results")
      .select("status, unsupported_spans, issues, rationale")
      .eq("tailored_resume_item_id", item.id)
      .order("run_at", { ascending: false })
      .limit(1);
    const flagged = validation?.[0] ?? null;

    let citations: Awaited<ReturnType<typeof loadCitations>>;
    try {
      citations = await loadCitations({ supabase, userId: context.userId }, [item.id]);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not load the stored citations.");
    }
    const cited = citations.sources
      .map((row) => (row.resume_evidence_id ? citations.evidenceById.get(row.resume_evidence_id) : undefined))
      .filter(Boolean) as EvidenceRecord[];
    if (cited.length === 0) {
      return {
        ok: true as const,
        possible: false,
        statement: "",
        removed: [],
        rationale:
          "This claim has no valid stored evidence, so there is nothing to rewrite it from. Regenerate the tailored resume or add evidence to your master resume.",
      };
    }

    let raw: string | null = null;
    try {
      raw = await callGateway([
        { role: "system", content: REWRITE_PROMPT },
        {
          role: "user",
          content: `Section: ${item.section}${item.heading ? `\nHeading: ${item.heading}` : ""}\nFlagged claim: ${item.statement}\nValidation status: ${flagged?.status ?? "unknown"}\nValidator notes: ${flagged?.rationale ?? "none"}\nUnsupported wording: ${(flagged?.unsupported_spans ?? []).join("; ") || "none identified"}\n\nEvidence (the ONLY permitted source of facts):\n${cited
            .map((row) => `- id=${row.id} | ${evidenceText(row)}`)
            .join("\n")}`,
        },
      ]);
    } catch {
      raw = null;
    }
    if (!raw) return fail("The rewrite service is unavailable right now. Please retry.");

    let parsed: z.infer<typeof rewriteSchema>;
    try {
      parsed = rewriteSchema.parse(JSON.parse(raw));
    } catch {
      return fail("We couldn't read the proposed rewrite. Please retry.");
    }

    const statement = parsed.statement.trim();
    const corpus = cited.map(evidenceText).join("\n");
    const unmatchedMetrics = statement ? metricTokens(statement).filter((m) => !containsMetric(corpus, m)) : [];
    if (!parsed.possible || !statement || unmatchedMetrics.length > 0) {
      return {
        ok: true as const,
        possible: false,
        statement: "",
        removed: parsed.removed,
        rationale:
          unmatchedMetrics.length > 0
            ? `The proposed rewrite still contained figures (${unmatchedMetrics.join(", ")}) that your evidence does not state, so it was rejected. The flagged wording has been kept unchanged.`
            : parsed.rationale.trim() ||
              "No defensible rewrite exists from the cited evidence alone. The flagged claim has been kept unchanged.",
      };
    }

    return {
      ok: true as const,
      possible: true,
      statement,
      removed: parsed.removed.filter((row) => row.trim().length > 0),
      rationale: parsed.rationale.trim() || "Rewritten using only the wording your cited evidence substantiates.",
      evidenceIds: cited.map((row) => row.id),
    };
  });
