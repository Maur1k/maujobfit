# One-click resume download

Today, getting a resume takes several screens and clicks: open the job, generate a tailored resume, run the claim check, toggle a filter, then pick a download button. This collapses that into a single action.

## What changes

**One primary button on the job page: "Download my resume".**

Pressing it does everything in the background, in order:

1. Builds a fresh tailored resume for that job.
2. Runs the claim check automatically.
3. Downloads the one-page PDF.

While it works, the button shows the current step ("Building your resume…", "Checking your claims…", "Preparing your PDF…") so nothing feels frozen. When it finishes, a short confirmation appears with the number of checked claims, plus a small **Word (.docx)** link right beside it for anyone who needs an editable file.

If the check flags claims that cannot be supported, the download still happens using only the supported lines, and the confirmation says plainly how many lines were left out and links to the detailed screen to fix them.

**Same button on the jobs list**, so a resume can be pulled without opening the job first.

**Everything else moves under "Advanced".** A single collapsed "Advanced tools" section on the job page holds the links that are separate steps today: draft preview, claim review and editing, the audit/evidence PDF, match details, ATS check, cover letter, and version history. Nothing is removed — it is just out of the main path.

## Technical notes

- New `src/lib/resume-quick-download.ts`: an orchestration helper that calls `generateTailoredResume`, then `validateTailoredResume`, then re-reads the tailored resume rows and calls `buildProfessionalResumePdf` / `buildProfessionalResumeDocx`, returning `{ blob, fileName, version, checked, excludedCount }`. No new server functions, no schema changes; it reuses the exact existing generation, validation and export code so output is byte-identical to today's manual path.
- New `src/components/jobs/QuickResumeButton.tsx`: owns the step state, toasts, error handling and the Word secondary action. Used by `jobs.$jobId.index.tsx` and `jobs.index.tsx`.
- `jobs.$jobId.index.tsx`: primary button added near the top; the existing secondary link row is wrapped in a shadcn `Collapsible` labelled "Advanced tools".
- `jobs.$jobId.tailored.tsx` keeps all its current buttons untouched — it becomes the advanced path rather than the default one.
- Supported-only filtering for the quick path always uses supported claims, matching the current "validated export" behaviour.
- Verification: typecheck, then a live Playwright run on an existing job confirming one click produces a one-page A4 PDF matching the current export.
