# LinkedIn-style professional resume exports

## Goal
Replace the current Professional PDF and DOCX visual style with a clean LinkedIn-inspired resume layout. Keep the existing justified body text, supported-claim filtering, A4/one-page behavior, and recruiter-safe output.

## Implementation
- Redesign the shared professional header with a stronger name/title hierarchy and a compact, polished contact/link row.
- Restyle section headings and entry hierarchy to resemble a modern LinkedIn profile: clear section labels, prominent roles or project names, concise organization/date metadata, and highly scannable content.
- Preserve justified alignment for summaries, descriptions, bullets, skill lines, education details, and certification details; headings, names, and dates retain natural alignment.
- Keep the PDF and editable DOCX visually consistent, including spacing, typography, grouping, and all-black text suitable for ATS parsing and printing.
- Retain the current education and certification de-duplication, skill grouping, supported-only safeguards, selectable text, evidence privacy, and one-page auto-fit behavior.
- Update the download panel copy to describe the new LinkedIn-style professional layout without changing the audit/evidence export.
- Ensure application-package PDFs use the redesigned professional resume automatically.

## Technical details
- Extend the existing PDF and DOCX renderers rather than creating parallel data or export pipelines.
- Do not expose evidence IDs, citations, validation metadata, or provenance in recruiter-facing files.
- Keep export history, filenames, tailored-resume versioning, and Master Resume data unchanged.

## Verification
- Generate representative PDF and DOCX samples from the same tailored resume.
- Render and inspect every PDF page and the DOCX pages for overflow, clipping, awkward justification, spacing, duplicated education/certification text, and one-page A4 fit.
- Verify the application package contains the redesigned resume and that the audit/evidence PDF remains unchanged.
- Check the export workflow in the live preview and confirm the project builds cleanly.
