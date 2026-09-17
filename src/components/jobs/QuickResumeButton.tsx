import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { downloadBlob } from "@/lib/application-package";
import {
  buildResumeInOneStep,
  type QuickResumeFormat,
  type QuickResumeStep,
} from "@/lib/resume-quick-download";

const stepLabel: Record<Exclude<QuickResumeStep, "idle" | "done">, string> = {
  generating: "Building your resume…",
  validating: "Checking your claims…",
  repairing: "Tightening flagged lines…",
  rendering: "Preparing your file…",
};


/**
 * Single-action resume download: builds, checks and downloads in one press.
 * The detailed screens stay available for anyone who wants to review each step.
 */
export function QuickResumeButton({
  jobId,
  size = "default",
  showWordLink = true,
}: {
  jobId: string;
  size?: "default" | "sm";
  showWordLink?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<QuickResumeFormat | null>(null);
  const [step, setStep] = useState<QuickResumeStep>("idle");

  const run = async (format: QuickResumeFormat) => {
    if (!user || busy) return;
    setBusy(format);
    setStep("generating");
    try {
      const result = await buildResumeInOneStep({
        jobId,
        userId: user.id,
        format,
        onStep: setStep,
      });
      downloadBlob(result.blob, result.fileName);
      await queryClient.invalidateQueries({ queryKey: ["tailored-resume", jobId, user.id] });
      const notes = [
        `${result.checked} lines checked, ${result.includedCount} included`,
        result.repairedCount > 0
          ? `${result.repairedCount} reworded to match your own records`
          : null,
        result.excludedCount > 0
          ? `${result.excludedCount} left out because your records don't back them`
          : null,
        result.droppedSections.length > 0
          ? `No line survived the check for: ${result.droppedSections.join(", ")}`
          : null,
      ].filter(Boolean) as string[];
      toast.success("Your resume is downloaded.", {
        description:
          notes.join(". ") +
          (result.excludedCount > 0 || result.droppedSections.length > 0
            ? ". Open the detailed review to fix those lines."
            : "."),
      });

    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't finish your resume. Please try again.",
      );
    } finally {
      setBusy(null);
      setStep("idle");
    }
  };

  const activeLabel =
    busy && step !== "idle" && step !== "done" ? stepLabel[step] : "Working…";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={size} disabled={!!busy} onClick={() => void run("pdf")}>
        {busy === "pdf" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {activeLabel}
          </>
        ) : (
          <>
            <Download className="size-4" aria-hidden />
            Download my resume
          </>
        )}
      </Button>
      {showWordLink ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!!busy}
          onClick={() => void run("docx")}
          className="text-muted-foreground"
        >
          {busy === "docx" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileText className="size-4" aria-hidden />
          )}
          Word
        </Button>
      ) : null}
    </div>
  );
}

/** Collapsed home for the step-by-step tools, kept out of the main path. */
export function AdvancedJobTools({ jobId }: { jobId: string }) {
  const links = [
    { to: "/jobs/$jobId/preview", label: "Draft preview" },
    { to: "/jobs/$jobId/tailored", label: "Review and edit lines" },
    { to: "/jobs/$jobId/match", label: "Match details" },
    { to: "/jobs/$jobId/ats", label: "ATS check" },
    { to: "/jobs/$jobId/cover-letter", label: "Cover letter" },
    { to: "/jobs/$jobId/versions", label: "Version history" },
  ] as const;

  return (
    <details className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced tools</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.to} asChild variant="secondary" size="sm">
            <Link to={link.to} params={{ jobId }}>
              {link.label}
            </Link>
          </Button>
        ))}
      </div>
    </details>
  );
}
