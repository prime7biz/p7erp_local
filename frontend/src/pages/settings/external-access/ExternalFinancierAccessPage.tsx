import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { ExternalPrincipalAdminRow } from "@/types/externalAccess";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { Button } from "@/components/ui/button";
import { ExternalAccessInviteModal } from "@/components/external-access/ExternalAccessInviteModal";
import { ExternalAccessStatusBadge } from "@/components/external-access/ExternalAccessStatusBadge";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass, erpControlFocusClass } from "@/components/app/listPageLayout";

const SCOPES = ["tenant_summary", "orders_and_pipeline", "financial_summary", "full_financier_portal"] as const;

export function ExternalFinancierAccessPage() {
  const [rows, setRows] = useState<ExternalPrincipalAdminRow[]>([]);
  const [err, setErr] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [scope, setScope] = useState<string>("orders_and_pipeline");
  const [roleCode, setRoleCode] = useState("financier_viewer");
  const [tokenMsg, setTokenMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  async function load() {
    try {
      const r = await api.listExternalFinancierPrincipals({ limit: 100 });
      setRows(r.items);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-border p-3 text-sm">
        <label className="flex items-center gap-2">
          Role
          <select
            className={`rounded-lg border border-border px-2 py-1 ${erpControlFocusClass}`}
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
          >
            <option value="financier_viewer">financier_viewer</option>
            <option value="financier_analyst">financier_analyst</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Scope
          <select
            className={`rounded-lg border border-border px-2 py-1 ${erpControlFocusClass}`}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
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
          onSubmit={async ({ email, full_name }) => {
            const res = await api.inviteExternalFinancier({
              email,
              full_name,
              role_codes: [roleCode],
              access_scope: scope,
            });
            setTokenMsg(`Invite created. Token (copy now): ${res.invite_token}`);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
