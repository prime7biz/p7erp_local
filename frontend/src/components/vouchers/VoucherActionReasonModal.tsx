import { FormEvent, useEffect, useState } from "react";

type VoucherActionReasonModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  required?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

/**
 * Confirms destructive or sensitive voucher workflow actions with an optional/required reason.
 * Reasons are shown to the user on success; persisting to the backend requires API support (see docs/voucher_backend_gaps.md).
 */
export function VoucherActionReasonModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  required = true,
  onClose,
  onConfirm,
}: VoucherActionReasonModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const t = reason.trim();
    if (required && !t) return;
    onConfirm(t);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button type="button" className="text-text-muted hover:text-text-secondary" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {description ? <p className="mb-3 text-sm text-text-muted">{description}</p> : null}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text-secondary">
              {required ? "Reason (required)" : "Comment (optional)"}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              rows={3}
              placeholder="Enter a short reason for audit visibility…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded-lg border border-border-strong px-4 py-2 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
              disabled={required && !reason.trim()}
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
