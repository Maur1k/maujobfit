# JobFit homepage refinement

## Goal
Replace the current introductory page with the selected **Kinetic Editorial Minimalism** direction, using the Cloud White palette, Sora headings, Manrope body copy, and a product-showcase structure. Rename the visible product from **MauJobFit** to **JobFit** throughout the app and page metadata.

## Homepage
- Build a clean, high-impact opening that explains JobFit in plain language: it turns verified career history into job-ready resumes, cover letters, and application packages.
- Keep clear **Create account** and **Sign in** actions, with an additional path for returning users to open their dashboard.
- Add a purposeful product preview showing the journey from saved experience to job match, checked resume, and ready-to-send application—without exposing internal IDs or technical terms.
- Introduce the complete feature set in a scannable showcase:
  - Build or update a Master Resume, including PDF import.
  - Understand a job posting and compare it with real experience.
  - Create a tailored resume while keeping the Master Resume unchanged.
  - Check that every claim is supported by the user’s career history.
  - Export professional A4 PDF and DOCX files and create a cover-letter package.
  - Record applications, versions, dates, destinations, and progress.
- Add a short, tasteful **Developed with Lovable** credit.
- Remove outdated homepage copy that says job matching is “coming next.”

## Visual direction
- Apply the selected editorial composition: generous whitespace, strong left-aligned headline, restrained blue accents, precise information hierarchy, and compact corners.
- Use semi-transparent frosted surfaces for feature showcases, supported by subtle borders and restrained shadows rather than decorative effects.
- Add lightweight entrance and interaction transitions, with reduced-motion support.
- Adapt the composition for desktop, tablet, and mobile; keep actions and text readable without overlap or horizontal scrolling.

## Brand and metadata
- Change visible navigation, authentication copy, app shell branding, route titles, social metadata, and relevant in-app references from **MauJobFit** to **JobFit**.
- Update the homepage title and description to accurately describe the now-complete application workflow.
- Preserve existing routes, authentication, job tools, exports, and application tracking behavior.

## Technical details
- Reuse the existing TanStack routes, shared buttons, icons, authentication flow, and semantic design tokens.
- Update global tokens and font loading for Sora and Manrope; keep all colors theme-safe and maintain accessible contrast.
- Keep this as a presentation and naming update only—no database or business-logic changes.

## Verification
- Check the homepage at desktop and mobile sizes, including navigation, calls to action, feature content, and footer credit.
- Confirm all changed links work and authenticated screens retain their existing behavior.
- Search for stale visible **MauJobFit** references, then confirm the preview builds without errors.
