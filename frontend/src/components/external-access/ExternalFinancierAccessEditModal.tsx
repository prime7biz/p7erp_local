import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";
import type { FinancierPrincipalOption } from "@/components/external-access/ExternalAccessInviteModal";
import type { ExternalPrincipalAdminRow } from "@/types/externalAccess";

type ScopeOption = {
  value: string;
  label: string;
};

export function ExternalFinancierAccessEditModal({
  row,
  principals,
  principalsLoading,
  scopeOptions,
  onClose,
  onSubmit,
}: {
  row: ExternalPrincipalAdminRow;
  principals: FinancierPrincipalOption[];
  principalsLoading: boolean;
  scopeOptions: ScopeOption[];
  onClose: () => void;
  onSubmit: (data: { access_scope: string; financier_party_id: number | null }) => Promise<void>;
}) {
  const [scope, setScope] = useState(row.access_scope ?? "orders_and_pipeline");
  const [selectedFinancierPartyId, setSelectedFinancierPartyId] = useState(
    row.financier_party_id != null ? String(row.financier_party_id) : "__none__",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!scope.trim()) {
      setErr("Select an access scope");
      return;
    }
    if (principalsLoading) {
      setErr("Still loading financier parties");
      return;
    }
    setBusy(true);
    try {
      const pid = selectedFinancierPartyId.trim();
      let financierPartyId: number | null = null;
      if (pid !== "" && pid !== "__none__" && pid !== "__loading__") {
        const parsed = Number(pid);
        financierPartyId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      }
      await onSubmit({
        access_scope: scope,
        financier_party_id: financierPartyId,
      });
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
        <h2 className="text-lg font-semibold text-text-primary">Edit financier access</h2>
        <p className="mt-1 text-sm text-text-muted">{row.email}</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-text-muted">Access scope</label>
            <select
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted">Financier party (bank / lender record)</label>
            <select
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={principalsLoading ? "__loading__" : selectedFinancierPartyId}
              onChange={(e) => setSelectedFinancierPartyId(e.target.value)}
              disabled={principalsLoading}
            >
              {principalsLoading ? (
                <option value="__loading__">Loading parties…</option>
              ) : (
                <>
                  <option value="__none__">None</option>
                  {principals.map((party) => (
                    <option key={party.id} value={String(party.id)}>
                      {party.id} — {party.full_name || "—"} ({party.email || "no email"})
                    </option>
                  ))}
                </>
              )}
            </select>
            <p className="mt-1 text-[11px] text-text-muted">
              Match this with the same financier party used on facilities for credit and portfolio views.
            </p>
          </div>
          {err ? <p className="text-sm text-status-danger-foreground">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || principalsLoading}>
              {busy ? "Saving…" : "Save access"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
