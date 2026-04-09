import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { ExternalPrincipalAdminRow } from "@/types/externalAccess";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { Button } from "@/components/ui/button";
import { ExternalAccessInviteModal } from "@/components/external-access/ExternalAccessInviteModal";
import { ExternalFinancierAccessEditModal } from "@/components/external-access/ExternalFinancierAccessEditModal";
import { ExternalAccessStatusBadge } from "@/components/external-access/ExternalAccessStatusBadge";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

const SCOPE_OPTIONS = [
  { value: "tenant_summary", label: "tenant_summary" },
  { value: "orders_and_pipeline", label: "orders_and_pipeline" },
  { value: "financial_summary", label: "financial_summary" },
  { value: "credit_monitoring", label: "credit_monitoring" },
  { value: "full_financier_portal", label: "full_financier_portal" },
] as const;

const FINANCIER_ROLE_OPTIONS = [
  { value: "financier_viewer", label: "financier_viewer" },
  { value: "financier_analyst", label: "financier_analyst" },
] as const;

export function ExternalFinancierAccessPage() {
  const [rows, setRows] = useState<ExternalPrincipalAdminRow[]>([]);
  const [err, setErr] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ExternalPrincipalAdminRow | null>(null);
  const [tokenMsg, setTokenMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [financierPrincipals, setFinancierPrincipals] = useState<
    { id: number; full_name: string | null; email: string | null }[]
  >([]);
  const [financierPrincipalsLoading, setFinancierPrincipalsLoading] = useState(false);

  async function load() {
    try {
      const r = await api.listExternalFinancierPrincipals({ limit: 100 });
      setRows(r.items);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function loadFinancierParties() {
    setFinancierPrincipalsLoading(true);
    try {
      const list = await api.listFinancierPrincipalsForFacility();
      setFinancierPrincipals(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load financier parties");
      setFinancierPrincipals([]);
    } finally {
      setFinancierPrincipalsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (inviteOpen || editingRow) void loadFinancierParties();
  }, [inviteOpen, editingRow]);

  useEffect(() => {
    if (openActionsId == null) return;
    const onDown = () => setOpenActionsId(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openActionsId]);

  return (
    <div>
      <AppPageHeader title="Financier portal access" description="Invite banks / lenders with scoped visibility." />
      <p className="text-sm mb-4">
        <Link to="/app/settings/external-access" className="text-brand-primary">
          ← Overview
        </Link>
      </p>
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      {tokenMsg ? <div className="mb-4 rounded-lg border border-status-info/30 bg-status-info-subtle p-3 text-sm">{tokenMsg}</div> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => setInviteOpen(true)}>
          Invite financier
        </Button>
      </div>
      <p className="mb-4 text-xs text-text-muted">
        For credit-line and loan portfolio views, choose scope <code>credit_monitoring</code> or higher in the invite form and link
        the same <strong>financier party</strong> you use on facilities.
      </p>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={listTableHeadCellClass}>Email</th>
            <th className={listTableHeadCellClass}>Scope</th>
            <th className={listTableHeadCellClass}>Roles</th>
            <th className={listTableHeadCellClass}>Status</th>
            <th className={listTableHeadCellClass}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={listTableRowClass}>
              <td className="px-3 py-2">{r.email}</td>
              <td className="px-3 py-2 text-xs">{r.access_scope ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-text-muted">{r.role_codes.join(", ")}</td>
              <td className="px-3 py-2">
                <ExternalAccessStatusBadge variant={r.is_active ? "active" : "inactive"}>
                  {r.is_active ? "Active" : "Inactive"}
                </ExternalAccessStatusBadge>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <div className="relative inline-block text-left">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setOpenActionsId((prev) => (prev === r.id ? null : r.id))}
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Actions
                  </button>
                  {openActionsId === r.id ? (
                    <div
                      className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => {
                          setOpenActionsId(null);
                          setEditingRow(r);
                        }}
                      >
                        Edit access
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={async () => {
                          setOpenActionsId(null);
                          try {
                            if (r.is_active) await api.deactivateExternalPrincipal(r.id);
                            else await api.reactivateExternalPrincipal(r.id);
                            await load();
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        {r.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {inviteOpen ? (
        <ExternalAccessInviteModal
          title="Invite financier user"
          onClose={() => setInviteOpen(false)}
          financierInvite={{
            principals: financierPrincipals,
            principalsLoading: financierPrincipalsLoading,
            scopeOptions: [...SCOPE_OPTIONS],
            roleOptions: [...FINANCIER_ROLE_OPTIONS],
          }}
          onSubmit={async ({ email, full_name, role_code, access_scope, financier_party_id }) => {
            const res = await api.inviteExternalFinancier({
              email,
              full_name,
              role_codes: [role_code ?? "financier_viewer"],
              access_scope: access_scope ?? "orders_and_pipeline",
              financier_party_id: financier_party_id ?? null,
            });
            if (res.invite_email_sent) setTokenMsg(res.message || `Invitation email sent to ${email}.`);
            else if (res.invite_token)
              setTokenMsg(`Invitation created. Email failed, so share token manually: ${res.invite_token}`);
            else setTokenMsg(res.message || "Invitation created.");
            await load();
          }}
        />
      ) : null}
      {editingRow ? (
        <ExternalFinancierAccessEditModal
          row={editingRow}
          principals={financierPrincipals}
          principalsLoading={financierPrincipalsLoading}
          scopeOptions={[...SCOPE_OPTIONS]}
          onClose={() => setEditingRow(null)}
          onSubmit={async ({ access_scope, financier_party_id }) => {
            await api.patchExternalFinancierPrincipal(editingRow.id, {
              access_scope,
              financier_party_id,
            });
            setTokenMsg(`Updated financier access for ${editingRow.email}.`);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
