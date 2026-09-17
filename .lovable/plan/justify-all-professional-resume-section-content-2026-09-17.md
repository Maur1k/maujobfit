# Justify all professional resume section content

## Goal
Make the Professional PDF and DOCX exports consistently justify the text within every resume section, while keeping short structural lines naturally aligned.

## Changes
- Keep the resume name, target role, contact details, section headings, entry titles, and right-aligned dates unchanged.
- Apply justified alignment to all section content in both exporters:
  - Professional Summary
  - Experience and Project descriptions/bullets
  - Experience subtitles and project technology lines
  - Technical Skills group lines
  - Education institution and major lines
  - Certification issuer/date and detail lines
- Preserve the existing A4 layout, spacing, one-page fitting behavior, black text, evidence filtering, and export filenames.

## Technical details
- Extend the PDF renderer’s existing justification path to the remaining section-content writers, including mixed bold-label skill rows.
- Set paragraph-level justified alignment on the equivalent DOCX paragraphs without changing heading styles or date tab stops.
- Avoid stretching structural one-line headings and labels where justification would create unnatural word spacing.

## Verification
- Generate representative Professional PDF and DOCX samples using long multi-line content.
- Render the PDF and DOCX for visual inspection, confirming section text is justified and no text overlaps or exceeds the A4 page width.
- Verify the project build and type checks remain clean.
