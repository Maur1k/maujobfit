import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ClipboardCheck,
  FileCheck2,
  FileOutput,
  FileStack,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobFit — Evidence-Backed Job Applications" },
      {
        name: "description",
        content:
          "Turn your verified career history into tailored resumes, cover letters and complete job applications without inventing experience.",
      },
      { property: "og:title", content: "JobFit — Your history, job-ready" },
      {
        property: "og:description",
        content:
          "Create truthful, tailored resumes and cover letters, then package and track every application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: FileStack,
    eyebrow: "Your foundation",
    title: "One complete career record",
    body: "Build your Master Resume by hand or import a PDF. Update it whenever your experience grows, while keeping every detail organized.",
    className: "md:col-span-2",
  },
  {
    icon: ScanSearch,
    eyebrow: "Clear comparison",
    title: "See how you fit",
    body: "Paste a job posting to see your strongest matches, supporting experience and genuine gaps in plain language.",
    className: "",
  },
  {
    icon: FileCheck2,
    eyebrow: "Tailored, not invented",
    title: "Shape the right resume",
    body: "JobFit selects and emphasizes relevant experience while your original Master Resume stays unchanged.",
    className: "",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Built-in trust",
    title: "Check every claim",
    body: "Each tailored statement is checked against your saved career history. Anything uncertain is clearly flagged before you send it.",
    className: "md:col-span-2",
  },
  {
    icon: FileOutput,
    eyebrow: "Ready to send",
    title: "Export the full package",
    body: "Download a professional A4 resume as PDF or DOCX, add an evidence-backed cover letter, or combine both into one application PDF.",
    className: "md:col-span-2",
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: "Stay organized",
    title: "Track every application",
    body: "Record what you sent, where you sent it, the resume version you used, the date and your current progress.",
    className: "",
  },
];

function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="font-display text-xl font-bold text-foreground">
            JobFit<span className="text-primary">.</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">
                Get started <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20 lg:py-20">
          <div className="animate-rise space-y-8">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="size-4" aria-hidden />
              Your experience stays truthful
            </div>
            <div className="space-y-5">
              <h1 className="max-w-2xl font-display text-5xl font-bold leading-[1.04] sm:text-6xl lg:text-7xl">
                Your history,
                <span className="block text-muted-foreground">job-ready.</span>
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                JobFit turns your real career history into focused resumes, cover letters and
                complete applications for every opportunity—without making up experience.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/auth">
                  Create your account <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/dashboard">Open your dashboard</Link>
              </Button>
            </div>
            <div className="grid max-w-xl gap-3 pt-2 text-sm text-foreground sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden /> Match real experience
              </p>
              <p className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden /> Check every tailored claim
              </p>
            </div>
          </div>

          <div className="animate-rise-late relative mx-auto w-full max-w-2xl">
            <div className="absolute inset-x-12 inset-y-6 -z-10 bg-primary/10 blur-3xl" />
            <div className="glass-panel rounded-lg p-4 shadow-2xl sm:p-6">
              <div className="flex items-center justify-between border-b border-border/70 pb-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">APPLICATION WORKSPACE</p>
                  <p className="mt-1 font-display text-lg font-semibold">Product Designer · Northstar</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Draft ready
                </span>
              </div>
              <div className="grid gap-4 py-5 sm:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-2">
                  {[
                    { icon: FileStack, label: "Career history", status: "Complete" },
                    { icon: ScanSearch, label: "Job match", status: "Strong" },
                    { icon: FileCheck2, label: "Tailored resume", status: "Checked" },
                    { icon: ClipboardCheck, label: "Application", status: "Ready" },
                  ].map(({ icon: Icon, label, status }, index) => (
                    <div
                      key={String(label)}
                      className={`flex items-center gap-3 rounded-md border px-3 py-3 ${
                        index === 2 ? "border-primary/30 bg-primary/10" : "border-transparent bg-secondary/70"
                      }`}
                    >
                      <Icon className="size-4 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">{status}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-border/80 bg-card/90 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg font-bold">Alex Morgan</p>
                      <p className="text-xs text-muted-foreground">Product Designer</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">A4 · 1 page</span>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="mb-2 h-2 w-20 rounded-full bg-foreground/80" />
                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full rounded-full bg-border" />
                        <div className="h-1.5 w-11/12 rounded-full bg-border" />
                        <div className="h-1.5 w-4/5 rounded-full bg-border" />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 h-2 w-28 rounded-full bg-foreground/80" />
                      <div className="space-y-2">
                        {["Matched the role", "Grounded in your work", "Clear and readable"].map(
                          (line) => (
                            <div key={line} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Check className="size-3 text-evidence" aria-hidden /> {line}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 pt-4 text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="size-4 text-evidence" aria-hidden /> All claims checked
                </span>
                <span className="font-semibold text-foreground">Ready to export</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-secondary/40 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mb-12 grid gap-5 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="mb-3 text-sm font-semibold text-primary">FROM FIRST DRAFT TO SENT</p>
                <h2 className="max-w-2xl font-display text-3xl font-bold sm:text-5xl">
                  Everything your application needs, in one place.
                </h2>
              </div>
              <p className="max-w-xl text-base leading-7 text-muted-foreground lg:justify-self-end">
                JobFit keeps the process simple: start with what you have done, understand the role,
                shape the right story and keep track of where it goes.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, eyebrow, title, body, className }) => (
                <article key={title} className={`glass-panel group rounded-lg p-6 sm:p-8 ${className}`}>
                  <div className="mb-10 flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary transition-transform duration-300 group-hover:-translate-y-1">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">{eyebrow}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold">{title}</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="size-4" aria-hidden /> DEVELOPED WITH LOVABLE
              </p>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Made to help you apply with confidence.</h2>
            </div>
            <div className="grid gap-6 border-l border-border pl-6 sm:grid-cols-3 sm:pl-10">
              {[
                ["1", "Save your story", "Keep one complete, reliable record of your career."],
                ["2", "Fit the role", "Choose what matters for each opportunity."],
                ["3", "Send with confidence", "Check, export and track the finished application."],
              ].map(([number, title, body]) => (
                <div key={number}>
                  <p className="font-mono text-xs text-primary">0{number}</p>
                  <h3 className="mt-3 font-display font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-display text-sm font-bold text-foreground">JobFit.</span>
          <span>Truthful resumes. Focused applications. Clear progress.</span>
          <span>Developed with Lovable</span>
        </div>
      </footer>
    </div>
  );
}
