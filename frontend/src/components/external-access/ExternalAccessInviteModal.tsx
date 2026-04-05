import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function ExternalAccessInviteModal({
  title,
  onClose,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (data: { email: string; full_name: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!email.trim() || !fullName.trim()) {
      setErr("Email and name required");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ email: email.trim(), full_name: fullName.trim() });
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-inverse/40 p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-text-muted">Email</label>
            <input
              type="email"
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Full name</label>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          {err ? <p className="text-sm text-status-danger-foreground">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Create invite"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
