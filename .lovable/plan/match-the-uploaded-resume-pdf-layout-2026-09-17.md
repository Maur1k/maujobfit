# Match the uploaded resume PDF layout

## Goal
Update the Professional PDF and DOCX exports so they follow the uploaded resume reference more closely: compact, all-black, one-page A4, recruiter-facing, and easy to scan.

## Layout changes
- Header prints the name in large bold text, followed by a single role/headline line and one compact contact line.
- Section headings use simple bold labels with a thin horizontal rule below each heading.
- Professional Summary remains justified and compact, without extra blank space.
- Experience shows company first, then role and date on the next line, followed by compact bullets.
- Projects show each project title in bold with bullets underneath.
- Technical Skills uses the reference style: `Group: skill, skill, skill` on compact lines, using the user's own skill group names where available.
- Education prints exactly as three clean lines when the data supports it: degree/batch, institution, major.
- Certifications print title first, then one issuer/date line, with no duplicated issuer or date.

## Preserve existing behavior
- Keep Master Resume immutable.
- Keep supported-only professional exports and existing evidence validation rules.
- Keep citations/internal evidence out of the Professional PDF and DOCX.
- Keep the Audit / Evidence PDF unchanged.
- Keep A4 as the only/default size and one page as the default target.

## Technical notes
- Adjust the shared professional PDF renderer spacing, heading rules, entry hierarchy, bullet spacing, and auto-fit thresholds.
- Mirror the same structure in the DOCX renderer so Word export matches the PDF as closely as possible.
- Reuse the existing skill grouping fix so no generic leftover `Additional Tools` line appears when the user's own group labels are available.

## Verification
- Generate a sample Professional PDF and DOCX from an existing tailored resume.
- Render every generated page to images and inspect for overflow, clipping, duplicated text, excessive whitespace, and layout mismatch against the uploaded reference.
- Confirm the Audit / Evidence export remains unchanged.
- Confirm the build check is clean.
