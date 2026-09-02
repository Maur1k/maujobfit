import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { safeExternalUrl } from "@/lib/safe-url";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_JOB_TEXT_LENGTH,
  MIN_JOB_TEXT_LENGTH,
  normaliseSkill,
  normaliseSkillList,
} from "@/lib/job-analysis";

const analysisSchema = z.object({
  title: z.string().nullish(),
  company: z.string().nullish(),
  location: z.string().nullish(),
  employment_type: z.string().nullish(),
  seniority: z.string().nullish(),
  summary: z.string().nullish(),
  required_skills: z.array(z.string()).default([]),
  preferred_skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

const SYSTEM_PROMPT = `You extract structured data from a raw job posting. Rules:
- Only use information present in the posting. Never invent requirements, employers or seniority.
- If a value is absent, use null (or an empty array).
- required_skills: skills/technologies the posting marks as required or essential.
- preferred_skills: skills marked nice-to-have, preferred, bonus or advantageous.
- responsibilities: what the person will do, one short phrase per item, close to the source wording.
- qualifications: education, years of experience, certifications, language requirements.
- keywords: the ATS-relevant terms in the posting (technologies, domain terms, tools).
- Skill names: use the common canonical form (e.g. "React", "Node.js", "PHP"), one skill per array item, no sentences.
Return ONLY JSON matching:
{"title":null,"company":null,"location":null,"employment_type":null,"seniority":null,"summary":null,"required_skills":[],"preferred_skills":[],"responsibilities":[],"qualifications":[],"keywords":[]}`;

function stripFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response was not valid JSON.");
  return body.slice(start, end + 1);
}

function looksGarbled(text: string) {
  const letters = text.replace(/[^a-zA-Z]/g, "").length;
  return letters / text.length < 0.45;
}

export const analyzeJobDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rawText: string; sourceUrl?: string | null; jobId?: string | null }) =>
    z
      .object({
        rawText: z.string().max(60000),
        sourceUrl: z.string().max(2048).nullish(),
        jobId: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const raw = data.rawText.replace(/\u0000/g, "").trim();
    // Only plain http(s) links are stored; anything else (javascript:, data:) is dropped.
    const sourceUrl = safeExternalUrl(data.sourceUrl);

    if (raw.replace(/\s+/g, "").length < MIN_JOB_TEXT_LENGTH) {
      return {
        ok: false as const,
        error: `That looks too short to be a job description. Paste at least ${MIN_JOB_TEXT_LENGTH} characters of the posting.`,
      };
    }
    if (looksGarbled(raw)) {
      return {
        ok: false as const,
        error:
          "That text looks garbled — mostly symbols rather than words. Re-copy the posting as plain text and try again.",
      };
    }

    const text = raw.slice(0, MAX_JOB_TEXT_LENGTH);

    // Create or reuse the job record so the original text is always persisted,
    // even when the AI step fails.
    let jobId = data.jobId ?? null;
    if (jobId) {
      const { error } = await supabase
        .from("jobs")
        .update({
          raw_text: text,
          source_url: sourceUrl,
          analysis_status: "analyzing",
          error_message: null,
        })
        .eq("id", jobId);
      if (error) return { ok: false as const, error: error.message };
    } else {
      const { data: inserted, error } = await supabase
        .from("jobs")
        .insert({
          user_id: userId,
          title: "Untitled job",
          raw_text: text,
          source_url: sourceUrl,
          analysis_status: "analyzing",
          status: "saved",
        })
        .select("id")
        .single();
      if (error || !inserted) return { ok: false as const, error: error?.message ?? "Could not save the job." };
      jobId = inserted.id;
    }

    const fail = async (message: string) => {
      await supabase
        .from("jobs")
        .update({ analysis_status: "failed", error_message: message })
        .eq("id", jobId!);
      return { ok: false as const, error: message, jobId: jobId! };
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return fail("AI analysis is not configured for this project.");

    let parsed: z.infer<typeof analysisSchema>;
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Job posting:\n\n${text}` },
          ],
        }),
      });
      if (response.status === 429) {
        return fail("The AI service is rate limited right now. Wait a moment and retry the analysis.");
      }
      if (response.status === 402 || response.status === 403) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        return fail(
          body?.error?.message ??
            "AI analysis is unavailable for this workspace right now. Check your Lovable AI credits and retry.",
        );
      }
      if (!response.ok) {
        return fail("The AI service could not analyze this posting. Please retry.");
      }
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content ?? "";
      parsed = analysisSchema.parse(JSON.parse(stripFence(content)));
    } catch {
      return fail("We couldn't structure this posting. Please retry, or paste a cleaner copy of the text.");
    }

    const required = normaliseSkillList(parsed.required_skills);
    const preferred = normaliseSkillList(parsed.preferred_skills).filter(
      (skill) => !required.some((r) => r.canonical.toLowerCase() === skill.canonical.toLowerCase()),
    );

    const keywordSet = new Set<string>();
    for (const keyword of parsed.keywords) {
      const trimmed = keyword.trim();
      if (!trimmed) continue;
      keywordSet.add(normaliseSkill(trimmed).canonical);
    }
    for (const skill of [...required, ...preferred]) keywordSet.add(skill.canonical);

    const rows: {
      user_id: string;
      job_id: string;
      requirement: string;
      requirement_type: string;
      importance: string | null;
      keywords: string[];
      canonical_skill: string | null;
      aliases: string[];
      related_skills: string[];
      sort_order: number;
    }[] = [];
    let order = 0;

    for (const skill of required) {
      rows.push({
        user_id: userId,
        job_id: jobId,
        requirement: skill.canonical,
        requirement_type: "required_skill",
        importance: "required",
        keywords: [skill.canonical, ...skill.aliases],
        canonical_skill: skill.recognised ? skill.canonical : null,
        aliases: skill.aliases,
        related_skills: skill.related,
        sort_order: order++,
      });
    }
    for (const skill of preferred) {
      rows.push({
        user_id: userId,
        job_id: jobId,
        requirement: skill.canonical,
        requirement_type: "preferred_skill",
        importance: "preferred",
        keywords: [skill.canonical, ...skill.aliases],
        canonical_skill: skill.recognised ? skill.canonical : null,
        aliases: skill.aliases,
        related_skills: skill.related,
        sort_order: order++,
      });
    }
    for (const item of parsed.responsibilities) {
      const requirement = item.trim();
      if (!requirement) continue;
      rows.push({
        user_id: userId,
        job_id: jobId,
        requirement,
        requirement_type: "responsibility",
        importance: null,
        keywords: [],
        canonical_skill: null,
        aliases: [],
        related_skills: [],
        sort_order: order++,
      });
    }
    for (const item of parsed.qualifications) {
      const requirement = item.trim();
      if (!requirement) continue;
      rows.push({
        user_id: userId,
        job_id: jobId,
        requirement,
        requirement_type: "qualification",
        importance: null,
        keywords: [],
        canonical_skill: null,
        aliases: [],
        related_skills: [],
        sort_order: order++,
      });
    }

    await supabase.from("job_requirements").delete().eq("job_id", jobId);
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("job_requirements").insert(rows);
      if (insertError) return fail(insertError.message);
    }

    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        title: parsed.title?.trim() || "Untitled job",
        company: parsed.company?.trim() || null,
        location: parsed.location?.trim() || null,
        employment_type: parsed.employment_type?.trim() || null,
        seniority: parsed.seniority?.trim() || null,
        description: parsed.summary?.trim() || null,
        keywords: [...keywordSet],
        analysis_status: "ready",
        error_message: null,
      })
      .eq("id", jobId);
    if (updateError) return fail(updateError.message);

    return { ok: true as const, jobId, requirementCount: rows.length };
  });
