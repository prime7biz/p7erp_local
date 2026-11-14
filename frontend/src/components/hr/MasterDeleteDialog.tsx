/**
 * Confirm deleting a department or section. Loads how many records use it first, then explains that
 * they will show as "Undefined" (an empty link) after the delete.
 */
import { useEffect, useState } from "react";
import { logApiError } from "@/utils/logApiError";

export type DeleteImpactLine = { label: string; count: number };

type Props = {
  title: string;
  /** e.g. "DEPT-0003 - Sewing" */
  recordLabel: string;
  loadImpact: () => Promise<DeleteImpactLine[]>;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

export function MasterDeleteDialog({ title, recordLabel, loadImpact, onConfirm, onClose }: Props) {
  const [lines, setLines] = useState<DeleteImpactLine[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    loadImpact()
      .then((r) => live && setLines(r))
      .catch((e) => {
        logApiError("MasterDeleteDialog.impact", e);
        if (live) setLoadError(e instanceof Error ? e.message : "Could not check linked records");
      });
    return () => {
      live = false;
    };
    // Load once per opened dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inUse = (lines ?? []).filter((l) => l.count > 0);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-secondary">{recordLabel}</p>
        <div className="mt-4 text-sm" data-testid="delete-impact">
          {loadError ? (
            <p className="text-status-danger-foreground">{loadError}</p>
          ) : lines === null ? (
            <p className="text-text-muted">Checking linked records…</p>
          ) : inUse.length === 0 ? (
            <p className="text-text-secondary">Nothing uses it. It will simply be removed.</p>
          ) : (
            <>
              <p className="text-text-secondary">These records will show as <strong>Undefined</strong> after the delete:</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-text-primary">
                {inUse.map((l) => (
                  <li key={l.label}>
                    {l.count.toLocaleString()} {l.label}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-text-muted">You can assign them again later. This cannot be undone.</p>
            </>
          )}
        </div>
        {error && (
          <p className="mt-3 text-sm text-status-danger-foreground" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || lines === null || !!loadError}
            className="rounded bg-status-danger px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
