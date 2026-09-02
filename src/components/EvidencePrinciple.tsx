import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function EvidencePrinciple({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-evidence/30 bg-evidence/5 p-4",
        className,
      )}
    >
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-evidence" aria-hidden />
      <p className="text-sm leading-relaxed text-foreground">
        <span className="font-semibold">Core principle:</span> every tailored statement must be
        backed by source evidence from your Master Resume. No invented experience, no unverifiable
        claims — each line traces back to a record you approved.
      </p>
    </div>
  );
}
