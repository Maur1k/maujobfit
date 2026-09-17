# Fix the "Additional Tools" skills line

## What is wrong today

Your Master Resume stores skills in your own groups: Languages, Web Development,
APIs & Data, Databases & Services, Development, Tools, AI-Assisted Development.

When a tailored resume is generated, those group names are thrown away and only
the individual skill names survive. The exporter then re-sorts the loose names into
generic buckets of its own (Languages / Frontend / Backend / Databases / Tools &
Platforms), and everything it does not recognise falls into one leftover line
labelled "Additional Tools".

That leftover line is where the odd content comes from. On your latest tailored
resume it collects things like PayMongo, cPanel, Codemagic, Full-Stack Development,
CRUD Systems, Debugging and a bare word "Databases". So: some of it is relevant
(the real tools and platforms), but it is not resume-quality — capability phrases,
a category word, and tools are mixed on one line under a label that does not
describe them.

Your Master Resume also holds each skill group twice (14 groups, 7 unique), most
likely from importing a PDF twice. That doubles the material feeding the export.

## What will change

- Skills on the exported resume keep **your own group names** from the Master
  Resume. A group only appears if at least one of its skills was selected for that
  job; job-relevant groups and skills are listed first.
- No more automatic "Additional Tools" / "Additional" catch-all line. A skill with
  no group falls back to a single clearly named line only if one truly exists.
- Duplicates are removed at export time: the same group never prints twice, and the
  same skill never prints twice within a group. Your Master Resume data is left
  exactly as it is.
- Category words that are not real skills (for example a bare "Databases" that came
  from a group heading) are dropped from the skills line.
- Both the LinkedIn-style PDF and the DOCX behave identically. Nothing else about
  the resume, the audit/evidence export, or the application package changes.

## Technical notes

- `src/lib/composition.functions.ts`: skill candidates gain the owning skill-section
  item's title as a group label (from `resume_items.section = 'skill'`), carried on
  the candidate; skill labels equal to a group title are not emitted as skills.
- `src/lib/tailoring.functions.ts`: writes that group label into the skill draft's
  `heading` (currently `null`), so it persists on `tailored_resume_items` with all
  existing evidence links, priority and rationale untouched. No schema change needed.
- `src/lib/resume-pdf-professional.ts`: `groupSkills` accepts `{ name, group }` and
  groups by the supplied group name, preserving first-seen (relevance) order, with
  case-insensitive de-duplication of both group names and skills. The `SKILL_GROUPS`
  regex buckets remain only as a fallback for skills that arrive without a group.
- `src/lib/resume-docx-professional.ts` consumes the same `groupSkills` output, so it
  inherits the fix.
- Older tailored versions have no skill headings; they keep rendering through the
  existing fallback path.

## Verification

- `bunx tsgo --noEmit` plus a clean build.
- Regenerate the tailored resume for your Web Developer job, export the PDF and DOCX,
  render them to images and confirm the skills section shows your own group names,
  no duplicate groups or skills, and no "Additional Tools" line.
- Confirm the Master Resume skill records are unchanged (row and evidence counts).
