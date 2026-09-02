# JobFit

Build Phase 1 of an evidence-backed AI Resume Tailor. Use Lovable Cloud and Lovable AI. Create a polished, responsive dashboard experience with authentication, an empty Master Resume entry point, and the foundational account-scoped database schema centered on master_resumes and atomic resume_evidence records. Include resume_imports, jobs, job_requirements, match_results, tailored_resumes, tailored_resume_items, tailored_resume_item_sources, validation_results, and exports with secure per-user access. Do not build the AI pipeline or PDF import workflow yet, but use the attached RESUME-Dev.pdf only as design/content reference for realistic empty-state copy and future evidence categories. Make the UI clearly communicate the core principle: every tailored statement must be backed by source evidence. Set up signup/login/profile access and a dashboard with Master Resume status, recent tailoring empty state, and a clear 'Import PDF' / 'Create Master Resume' entry point. Enable Lovable Cloud first.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://maujobfit.lovable.app

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
