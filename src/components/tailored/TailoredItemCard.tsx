import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Loader2,
  Pencil,
  Quote,
  RefreshCcw,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { proposeTailoredItemRewrite, saveTailoredItem } from "@/lib/validation.functions";
import { validationIssueLabel, validationStatusLabel, type ValidationRow } from "@/lib/validation";
import type { TailoredItemRow, TailoredSourceRow } from "@/lib/tailoring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type EvidenceLite = {
  id: string;
  category: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  content: string;
};

export function StatusIcon({ status }: { status: string }) {
  if (status === "supported") return <CheckCircle2 className="size-4 text-[hsl(var(--evidence))]" aria-hidden />;
  if (status === "unsupported") return <XCircle className="size-4 text-destructive" aria-hidden />;
  if (status === "needs_review") return <CircleHelp className="size-4 text-amber-600" aria-hidden />;
  return <AlertTriangle className="size-4 text-amber-600" aria-hidden />;
}

export function statusBadgeClass(status?: string) {
  if (status === "supported") return "border-[hsl(var(--evidence))] text-[hsl(var(--evidence))]";
  if (status === "unsupported") return "border-destructive text-destructive";
  if (status === "partially_supported" || status === "needs_review") return "border-amber-500 text-amber-600";
  return "";
}

const FLAGGED = new Set(["partially_supported", "unsupported", "needs_review"]);

type Props = {
  item: TailoredItemRow;
  sources: TailoredSourceRow[];
  evidence: Map<string, EvidenceLite>;
  validation?: ValidationRow | undefined;
  onChanged: (reason: "item_edited" | "rewrite_accepted") => Promise<void> | void;
};

export function TailoredItemCard({ item, sources, evidence, validation, onChanged }: Props) {
  const status = validation?.status ?? item.validation_status;
  const flagged = FLAGGED.has(status);

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(item.statement);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    possible: boolean;
    statement: string;
    removed: string[];
    rationale: string;
  } | null>(null);

  const persist = async (statement: string, reason: "item_edited" | "rewrite_accepted") => {
    const result = await saveTailoredItem({ data: { itemId: item.id, statement } });
    if (!result.ok) throw new Error(result.error);
    await onChanged(reason);
    toast.success(`Saved and re-validated — now ${validationStatusLabel[result.status] ?? result.status}.`);
  };

  const save = async () => {
    const statement = draft.trim();
    if (statement.length < 3) {
      setSaveError("Write at least a few words before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await persist(statement, "item_edited");
      setEditOpen(false);
      setProposal(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving failed. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  const requestRewrite = async () => {
    setRewriting(true);
    setRewriteError(null);
    try {
      const result = await proposeTailoredItemRewrite({ data: { itemId: item.id } });
      if (!result.ok) {
        setRewriteError(result.error);
        return;
      }
      setProposal({
        possible: result.possible,
        statement: result.statement,
        removed: result.removed,
        rationale: result.rationale,
      });
    } catch {
      setRewriteError("The rewrite request failed. Please retry.");
    } finally {
      setRewriting(false);
    }
  };

  const acceptRewrite = async () => {
    if (!proposal?.possible) return;
    setSaving(true);
    try {
      await persist(proposal.statement, "rewrite_accepted");
      setProposal(null);
    } catch (error) {
      setRewriteError(error instanceof Error ? error.message : "Saving the rewrite failed. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {item.heading ? <p className="font-display text-sm font-semibold">{item.heading}</p> : null}
          <p className="text-sm leading-relaxed">{item.statement}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${statusBadgeClass(status)}`}>
            {validationStatusLabel[status] ?? status}
          </Badge>
          {item.confidence !== null ? (
            <span className="font-mono text-xs text-muted-foreground">{Math.round(item.confidence * 100)}%</span>
          ) : null}
        </div>
      </div>
      {item.rationale ? <p className="mt-2 text-xs text-muted-foreground">{item.rationale}</p> : null}

      {validation ? (
        <div
          className={`mt-3 rounded-md border p-3 text-xs leading-relaxed ${
            validation.status === "unsupported"
              ? "border-destructive/50 bg-destructive/5"
              : validation.status === "supported"
                ? "border-[hsl(var(--evidence))]/40 bg-[hsl(var(--evidence))]/5"
                : "border-amber-500/50 bg-amber-500/5"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon status={validation.status} />
            <span className="font-medium">{validationStatusLabel[validation.status]}</span>
            {validation.confidence !== null ? (
              <span className="font-mono text-muted-foreground">
                {Math.round(validation.confidence * 100)}% confidence
              </span>
            ) : null}
            <span className="font-mono uppercase tracking-wide text-muted-foreground">
              {validation.validator === "deterministic" ? "rule check" : "rule + AI check"}
            </span>
          </div>
          {validation.rationale ? <p className="mt-2">{validation.rationale}</p> : null}
          {validation.unsupported_spans.length > 0 ? (
            <p className="mt-2">
              <span className="font-medium">Not substantiated: </span>
              {validation.unsupported_spans.map((span) => (
                <span key={span} className="mr-1 rounded bg-destructive/15 px-1 py-0.5 font-mono text-destructive">
                  {span}
                </span>
              ))}
            </p>
          ) : null}
          {validation.issues.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {validation.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{validationIssueLabel[issue] ?? issue}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {proposal ? (
        <div
          className={`mt-3 rounded-md border p-3 text-xs leading-relaxed ${
            proposal.possible ? "border-[hsl(var(--evidence))]/50 bg-[hsl(var(--evidence))]/5" : "border-amber-500/50 bg-amber-500/5"
          }`}
        >
          <p className="font-medium">
            {proposal.possible ? "Proposed rewrite — review before it replaces the original" : "No defensible rewrite"}
          </p>
          {proposal.possible ? <p className="mt-2 text-sm leading-relaxed">{proposal.statement}</p> : null}
          <p className="mt-2 text-muted-foreground">{proposal.rationale}</p>
          {proposal.removed.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {proposal.removed.map((entry) => (
                <li key={entry} className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                  <span>Removed: {entry}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {proposal.possible ? (
              <Button size="sm" disabled={saving} onClick={() => void acceptRewrite()}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Accept rewrite
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
              {proposal.possible ? "Keep original" : "Dismiss"}
            </Button>
          </div>
        </div>
      ) : null}

      {rewriteError ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
          <span className="flex-1">{rewriteError}</span>
          <Button size="sm" variant="outline" onClick={() => void requestRewrite()}>
            <RefreshCcw className="size-3.5" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
              <Quote className="size-3.5" aria-hidden />
              {sources.length} evidence citation{sources.length === 1 ? "" : "s"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {sources.map((source) => {
              const record = evidence.get(source.resume_evidence_id);
              return (
                <div key={source.id} className="rounded-md border bg-secondary/40 p-3 text-xs leading-relaxed">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono uppercase tracking-wide text-muted-foreground">
                      {[record?.category, record?.role, record?.organization, record?.title]
                        .filter(Boolean)
                        .join(" · ") || "Evidence record"}
                    </span>
                    <Badge
                      className={
                        source.support_type === "primary"
                          ? "bg-[hsl(var(--evidence))] text-[hsl(var(--evidence-foreground))]"
                          : "bg-amber-500 text-white"
                      }
                    >
                      {source.support_type === "primary" ? "Exact support" : "Related support"}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{source.resume_evidence_id}</span>
                  </div>
                  <p>{source.excerpt ?? record?.content}</p>
                </div>
              );
            })}
            {sources.length === 0 ? (
              <p className="text-xs text-destructive">No citation recorded for this item.</p>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        {flagged ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setDraft(item.statement);
                setSaveError(null);
                setEditOpen(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden />
              Edit claim
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={rewriting || saving}
              onClick={() => void requestRewrite()}
            >
              {rewriting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Rewriting…
                </>
              ) : (
                <>
                  <Wand2 className="size-3.5" aria-hidden />
                  Rewrite with stronger evidence
                </>
              )}
            </Button>
          </>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit claim</DialogTitle>
            <DialogDescription>
              Saving re-runs validation against this item's existing citations only — no evidence is added or
              substituted, and your master resume is untouched.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} />
          {sources.length > 0 ? (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border bg-secondary/40 p-3 text-xs">
              <p className="font-medium">Evidence you must stay within</p>
              {sources.map((source) => (
                <p key={source.id} className="text-muted-foreground">
                  {source.excerpt ?? evidence.get(source.resume_evidence_id)?.content}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-destructive">This item has no stored citation, so nothing can substantiate it.</p>
          )}
          {saveError ? (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden />
              {saveError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving &amp; validating…
                </>
              ) : (
                "Save & re-validate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
