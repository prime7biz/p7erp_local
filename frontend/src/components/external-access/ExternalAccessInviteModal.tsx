import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import type { CustomerResponse } from "@/api/client";
import { fetchCustomerPage, hydrateCustomer } from "@/lib/remoteSelectFetchers";

export type FinancierPrincipalOption = {
  id: number;
  full_name: string | null;
  email: string | null;
};

export type ExternalAccessInviteSubmitData = {
  email: string;
  full_name: string;
  customer_id?: number;
  role_code?: string;
  /** Financier invite: optional party to link (facility.financier_party_id). */
  financier_party_id?: number | null;
  access_scope?: string;
};

export type FinancierInviteModalConfig = {
  principals: FinancierPrincipalOption[];
  principalsLoading: boolean;
  scopeOptions: { value: string; label: string }[];
  roleOptions: { value: string; label: string }[];
};

export function ExternalAccessInviteModal({
  title,
  onClose,
  onSubmit,
  customers,
  roleOptions,
  financierInvite,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (data: ExternalAccessInviteSubmitData) => Promise<void>;
  /** When set (including empty array), show customer + optional role pickers (customer portal invite). */
  customers?: CustomerResponse[];
  /** Kept for call-site compatibility; picker uses RemoteSearchSelect instead of a preloaded list. */
  customersLoading?: boolean;
  roleOptions?: { value: string; label: string }[];
  /** When set, show financier party + scope + role pickers (financier portal invite). */
  financierInvite?: FinancierInviteModalConfig;
}) {
  const customerMode = customers !== undefined;
  const financierMode = financierInvite !== undefined;

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | "">("");
  const [selectedFinancierPartyId, setSelectedFinancierPartyId] = useState("__none__");
  const [scope, setScope] = useState(financierInvite?.scopeOptions[0]?.value ?? "orders_and_pipeline");
  const [roleCode, setRoleCode] = useState(
    financierMode ? financierInvite!.roleOptions[0]?.value ?? "financier_viewer" : roleOptions?.[0]?.value ?? "customer_viewer",
  );
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function applyCustomer(id: number | "", meta?: CustomerResponse) {
    setSelectedCustomerId(id);
    if (typeof id !== "number" || id < 1) {
      setEmail("");
      setFullName("");
      return;
    }
    if (!meta) return;
    const nextEmail = (meta.contact_email || meta.email || "").trim();
    const nextName = (meta.primary_contact_name || meta.name || "").trim();
    setEmail(nextEmail);
    setFullName(nextName);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!email.trim() || !fullName.trim()) {
      setErr("Email and name required");
      return;
    }
    if (customerMode) {
      if (typeof selectedCustomerId !== "number" || selectedCustomerId < 1) {
        setErr("Select a customer");
        return;
      }
    }
    if (financierMode) {
      if (financierInvite!.principalsLoading) {
        setErr("Still loading financier parties");
        return;
      }
    }
    setBusy(true);
    try {
      const payload: ExternalAccessInviteSubmitData = {
        email: email.trim(),
        full_name: fullName.trim(),
      };
      if (customerMode) {
        payload.customer_id = Number(selectedCustomerId);
        if (roleOptions?.length) {
          payload.role_code = roleCode;
        }
      }
      if (financierMode) {
        payload.role_code = roleCode;
        payload.access_scope = scope;
        const pid = selectedFinancierPartyId.trim();
        if (pid === "" || pid === "__none__" || pid === "__loading__") {
          payload.financier_party_id = null;
        } else {
          const n = Number(pid);
          payload.financier_party_id = Number.isInteger(n) && n > 0 ? n : null;
        }
      }
      await onSubmit(payload);
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const submitDisabled =
    busy ||
    (customerMode && (typeof selectedCustomerId !== "number" || selectedCustomerId < 1)) ||
    (financierMode && financierInvite!.principalsLoading);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
          {financierMode ? (
            <>
              <div>
                <label className="text-xs font-medium text-text-muted">Financier party (bank / lender record)</label>
                <select
                  className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                  value={financierInvite!.principalsLoading ? "__loading__" : selectedFinancierPartyId}
                  onChange={(e) => setSelectedFinancierPartyId(e.target.value)}
                  disabled={financierInvite!.principalsLoading}
                >
                  {financierInvite!.principalsLoading ? (
                    <option value="__loading__">Loading parties…</option>
                  ) : (
                    <>
                      <option value="__none__">None (new external user — link facility later)</option>
                      {financierInvite!.principals.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.id} — {p.full_name || "—"} ({p.email || "no email"})
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <p className="mt-1 text-[11px] text-text-muted">
                  Choose the same party you set on facilities as <strong>financier party</strong> for credit-line views.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted">Access scope</label>
                <select
                  className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  {financierInvite!.scopeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted">Portal role</label>
                <select
                  className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value)}
                >
                  {financierInvite!.roleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          {customerMode ? (
            <>
              <div>
                <label className="text-xs font-medium text-text-muted">Customer</label>
                <RemoteSearchSelect<CustomerResponse>
                  className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                  placeholder="Search customer…"
                  value={selectedCustomerId}
                  onChange={(next, opt) => {
                    const id = typeof next === "number" && next > 0 ? next : "";
                    applyCustomer(id, opt?.meta);
                  }}
                  fetchPage={fetchCustomerPage}
                  hydrateById={hydrateCustomer}
                  allowClear
                  menuPortal
                />
              </div>
              {roleOptions && roleOptions.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-text-muted">Portal role</label>
                  <select
                    className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value)}
                  >
                    {roleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : null}
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
            <Button type="submit" disabled={submitDisabled}>
              {busy ? "Sending…" : "Create invite"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
