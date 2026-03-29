import { FieldConfidenceBadge } from "@/components/ai-extract/FieldConfidenceBadge";
import { cn } from "@/lib/utils";
import type { ConflictResolutionChoice, FieldApplyState } from "@/types/extraction";

type Props = {
  title?: string;
  fields: FieldApplyState[];
  onApply: (fieldKey: string) => void;
  onApplyAllHigh: () => void;
  onSkip: (fieldKey: string) => void;
  onResolveConflict: (fieldKey: string, choice: ConflictResolutionChoice) => void;
  className?: string;
  /** Explains whether applies hit the server / main Save button */
  persistNote?: string;
  /** Column header for the AI-suggested value (default: extracted from document) */
  valueColumnLabel?: string;
};

export function AutofillReviewPanel({
  title = "Review extracted fields",
  fields,
  onApply,
  onApplyAllHigh,
  onSkip,
  onResolveConflict,
  className,
  persistNote,
  valueColumnLabel = "Extracted",
}: Props) {
  const pending = fields.filter((f) => !f.applied && !f.skipped);
  const highPending = pending.filter((f) => f.confidenceLevel === "high" && !f.hasConflict);

  if (fields.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-border bg-surface-raised p-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <button
          type="button"
          className="rounded-lg border border-border-strong bg-surface-base px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-subtle disabled:opacity-40"
          onClick={onApplyAllHigh}
          disabled={highPending.length === 0}
        >
          Apply all high-confidence
        </button>
      </div>
      <p className="text-text-muted mt-1 text-xs">
        {persistNote ??
          "Values are not saved until you use the main Save button. Resolve conflicts before applying."}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-2">Field</th>
              <th className="py-2 pr-2">{valueColumnLabel}</th>
              <th className="py-2 pr-2">Confidence</th>
              <th className="py-2 pr-2">Current</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((row) => (
              <FieldRow
                key={row.fieldKey}
                row={row}
                onApply={onApply}
                onSkip={onSkip}
                onResolveConflict={onResolveConflict}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldRow({
  row,
  onApply,
  onSkip,
  onResolveConflict,
}: {
  row: FieldApplyState;
  onApply: (k: string) => void;
  onSkip: (k: string) => void;
  onResolveConflict: (k: string, c: ConflictResolutionChoice) => void;
}) {
  const applied = row.applied;
  const skipped = row.skipped;
  const conflict = row.hasConflict && !applied && !skipped;

  return (
    <tr className="border-b border-border/80 align-top">
      <td className="py-2 pr-2 font-medium text-text-primary">{row.label}</td>
      <td className="max-w-[200px] py-2 pr-2 break-words text-text-secondary">{row.extractedDisplay}</td>
      <td className="py-2 pr-2">
        <FieldConfidenceBadge level={row.confidenceLevel} score={row.confidence} />
      </td>
      <td className="max-w-[200px] py-2 pr-2 break-words text-text-muted">
        {row.currentValue || "—"}
      </td>
      <td className="py-2 pr-2">
        {applied ? (
          <span className="text-status-success text-xs font-medium">Applied</span>
        ) : skipped ? (
          <span className="text-text-muted text-xs">Skipped</span>
        ) : conflict ? (
          <span className="text-status-warning text-xs font-medium">Conflict</span>
        ) : (
          <span className="text-text-muted text-xs">Pending</span>
        )}
      </td>
      <td className="py-2">
        {applied || skipped ? null : (
          <div className="flex flex-col gap-1">
            {conflict ? (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-text-primary hover:bg-surface-subtle"
                  onClick={() => onResolveConflict(row.fieldKey, "keep")}
                >
                  Keep existing
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-text-primary hover:bg-surface-subtle"
                  onClick={() => onResolveConflict(row.fieldKey, "use_extracted")}
                >
                  Use extracted
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-text-primary hover:bg-surface-subtle"
                  onClick={() => onApply(row.fieldKey)}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-text-muted hover:bg-surface-subtle"
                  onClick={() => onSkip(row.fieldKey)}
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
