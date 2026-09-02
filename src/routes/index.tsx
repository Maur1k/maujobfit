import { createFileRoute, Link } from "@tanstack/react-router";
import { FileStack, Link2, ScanSearch, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidencePrinciple } from "@/components/EvidencePrinciple";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MauJobFit — Evidence-Backed AI Resume Tailoring" },
      {
        name: "description",
        content:
          "Build a master resume of atomic evidence, then tailor it to any job with every statement traceable to a real source record.",
      },
      { property: "og:title", content: "MauJobFit — Evidence-Backed Resume Tailoring" },
      {
        property: "og:description",
        content:
          "Every tailored statement is backed by source evidence from your master resume. No invented experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: FileStack,
    title: "Master Resume",
    body: "One canonical record of your experience, broken into atomic evidence: roles, projects, achievements, skills and metrics.",
  },
  {
    icon: ScanSearch,
    title: "Job requirements",
    body: "Paste a posting and it becomes a structured requirement list, ready to be matched against your evidence library.",
  },
  {
    icon: Link2,
    title: "Traceable output",
    body: "Each tailored bullet carries links to the evidence records that support it, plus a validation pass before export.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="font-display text-lg font-semibold">
            Mau<span className="text-evidence">·</span>JobFit
          </span>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-evidence/40 bg-evidence/10 px-3 py-1 text-xs font-medium text-evidence">
              <ShieldCheck className="size-3.5" aria-hidden /> Evidence-backed by design
            </span>
            <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.08] sm:text-5xl">
              A resume tailor that can prove every line.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              Most AI resume tools invent. This one starts from your own history, stores it as
              atomic evidence, and refuses to write a statement it cannot trace back to a source
              record you approved.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Create your account</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
            <EvidencePrinciple className="max-w-xl" />
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Tailored statement
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              Built REST services with Node.js, Express and MySQL to unify data from two separate
              databases into a single operations dashboard.
            </p>
            <div className="mt-5 space-y-2 border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Backed by
              </p>
              {[
                "Experience · Software Developer, operations platform",
                "Project · Operations & dispatch platform rebuild",
                "Skill · Node.js, Express, MySQL, REST APIs",
              ].map((source) => (
                <div
                  key={source}
                  className="flex items-start gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground"
                >
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-evidence" aria-hidden />
                  {source}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
          {steps.map(({ icon: Icon, title, body }) => (
            <div key={title} className="space-y-3">
              <Icon className="size-6 text-evidence" aria-hidden />
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground sm:px-6">
          MauJobFit — evidence-backed resume tailoring. PDF import is live; job matching arrives next.
        </div>
      </footer>
    </div>
  );
}
