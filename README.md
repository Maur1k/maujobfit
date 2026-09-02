# MauJobFit

**MauJobFit** is an evidence-driven AI resume tailoring platform designed to present the strongest, most relevant version of your real career experience for any target role — without hallucinating or inventing qualifications.

> **Core Principle**: *"Make the user's existing resume present the strongest version of their real experience for a specific job, without inventing qualifications."*

---

## 🎯 What Makes MauJobFit Different?

Most AI resume tools take a job description and freely rewrite your history with generic buzzwords, often inventing skills, metrics, and experiences. 

MauJobFit is built **evidence-first**:
- **Master Resume is the Source of Truth**: You maintain one comprehensive, canonical career record. Job analysis and resume tailoring *never* mutate, overwrite, or delete your Master Resume data.
- **Atomic Evidence Provenance**: Work bullets, projects, skills, and education are stored as citable atomic evidence records with stable IDs. Every generated claim links directly to the real evidence supporting it.
- **4-Tier Requirement Matching**: Evaluates every requirement in a job description against your actual evidence:
  - **Exact**: Direct, demonstrable bullet proof exists in your experience or projects.
  - **Related**: Relevant or transferable experience exists, clearly classified as adjacent rather than falsely equivalent.
  - **Listed Only**: Declared in your technical skills list, but not yet substantiated by project or work bullets.
  - **Missing**: No evidence exists in your Master Resume (highlighting genuine skill gaps).
- **Relevance Optimization (No Over-Filtering)**: Tailoring ranks and prioritizes content (`High Priority`, `Supporting`, `Low`, `Exclude`) to emphasize what matters most to recruiters while retaining your broader technical stack and career context.
- **Automated Evidence Validation**: Generated claims are verified against their cited evidence. If a claim oversteps, it is flagged for review or safely reverted to your original wording.
- **Recruiter-Ready Exports**:
  - **Internal Audit View**: Displays source evidence IDs, match rationales, and claim validation confidence for complete transparency.
  - **Professional Export (PDF & Word DOCX)**: Clean, single-column, ATS-friendly resumes completely free of internal metadata, UUIDs, or debug badges.
- **ATS & Readability Diagnostics**: Provides transparent keyword coverage and readability analytics rather than arbitrary scores.

---

**Live App**: [https://maujobfit.lovable.app](https://maujobfit.lovable.app)

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8c52845a-e3c1-474d-8220-033e70c24539).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
