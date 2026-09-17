# Fix: one-click resume came out without a summary

## What happened

Your download for the Application Developer job is missing the Professional Summary because the automatic claim check marked that summary line as unsupported, and the one-click download only prints lines marked supported.

The reason it was flagged is a wording nitpick, not a real problem: your stored summary lists Node.js, Express, React, Laravel, PHP, Flutter, MySQL, Firebase and REST APIs, and the written summary said "JavaScript" — a word that does not literally appear in the stored text. So the whole section was dropped silently, with no notice.

The same thing quietly dropped one project line and two skills in that same download.

## What to change

1. Repair instead of drop. After the claim check, any flagged line is sent through the existing repair step that rewrites it using only your stored wording, then re-checked. Lines that come back clean are printed. This reuses what the detailed screen already does one line at a time.
2. Never silently lose a section. If a section (summary, experience, projects, skills, education, certifications) would end up empty after the check, the download tells you which section was left out and why, instead of just handing over a shorter file.
3. Show a short result note after the download: how many lines were printed, how many were repaired, and anything still left out.
4. Nothing changes about the evidence rule: no line is printed unless your own stored records back it, and your master resume is never edited.

## Technical notes

- Root cause confirmed in the data: `tailored_resume_items` for resume `4175c7d7…` has the summary row at `validation_status = 'unsupported'` (validator rationale: "does not explicitly mention JavaScript"), and `src/lib/resume-quick-download.ts` filters `=== "supported"` before rendering.
- Add a repair pass in `resume-quick-download.ts` between `validateTailoredResume` and the supported-only filter: for each flagged item call the existing `proposeTailoredItemRewrite`, persist accepted rewrites via `saveTailoredItem`, then re-run `validateTailoredResume` once and re-read statuses. Cap the pass to one round; skip items where `possible: false`.
- Extend `QuickResumeResult` with `repairedCount` and `droppedSections: string[]`; surface both in `QuickResumeButton` via a toast/inline note.
- No schema changes. No change to `resume-pdf-professional.ts` / `resume-docx-professional.ts` rendering.

## Verification

- Re-run the one-click download for the Application Developer job in the live preview and render the PDF to image: the Professional Summary section must appear, and the result note must match what is in the file.
