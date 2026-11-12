/** Shared bits of the three budget / expense pages: "switched off" note, error banner and loading block. */

export const fieldClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

export const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50";

export function SwitchedOffNotice() {
  return (
    <div role="status" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
      <p className="font-semibold text-text-primary">Budget analytics is switched off</p>
      <p className="mt-1">
        An admin can switch on <b>Budget analytics and expense control</b> in Settings → Configuration → Finance. The
        Budgets page keeps working.
      </p>
    </div>
  );
}

/**
 * Error banner. 403 / 404 get a plain sentence; 422 (a choice the server cannot show, e.g. no department set)
 * shows the server's own explanation; anything else shows the message with a Retry button.
 */
export function ReportError({ error, status, onRetry }: { error: string; status: number; onRetry: () => void }) {
  if (!error) return null;
  if (status === 422) {
    return (
      <div role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-sm text-status-warning-foreground">
        <p className="font-semibold">This view cannot be shown</p>
        <p className="mt-0.5">{error}</p>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground"
    >
      <span>
        {status === 403
          ? "You do not have permission to view finance reports."
          : status === 404
            ? "This report is not switched on for your company, or the record was not found."
            : error}
      </span>
      {status !== 403 && status !== 404 ? (
        <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      <div className="h-8 animate-pulse rounded bg-surface-subtle" />
      <div className="h-48 animate-pulse rounded-xl bg-surface-subtle" />
    </div>
  );
}

export function NotesList({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs text-text-muted" aria-label="Notes">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}
