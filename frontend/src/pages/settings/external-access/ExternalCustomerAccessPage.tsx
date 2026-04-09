import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CustomerResponse } from "@/api/client";
import type { ExternalPrincipalAdminRow } from "@/types/externalAccess";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { Button } from "@/components/ui/button";
import { ExternalAccessInviteModal } from "@/components/external-access/ExternalAccessInviteModal";
import { ExternalAccessStatusBadge } from "@/components/external-access/ExternalAccessStatusBadge";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

const CUSTOMER_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "customer_viewer", label: "customer_viewer" },
  { value: "customer_collaborator", label: "customer_collaborator" },
];

export function ExternalCustomerAccessPage() {
  const [rows, setRows] = useState<ExternalPrincipalAdminRow[]>([]);
  const [err, setErr] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [tokenMsg, setTokenMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  async function load() {
    try {
      const r = await api.listExternalCustomerPrincipals({ limit: 100 });
      setRows(r.items);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function loadCustomers() {
    setCustomersLoading(true);
    try {
      const list = await api.listCustomers();
      setCustomers(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load customers");
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadCustomers();
  }, []);

  useEffect(() => {
    if (openActionsId == null) return;
    const onDown = () => setOpenActionsId(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openActionsId]);

  return (
    <div>
      <AppPageHeader title="Customer portal access" description="Invite buyers; map them to customer master records." />
      <p className="text-sm mb-4">
        <Link to="/app/settings/external-access" className="text-brand-primary">
          ← Overview
        </Link>
      </p>
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      {tokenMsg ? <div className="mb-4 rounded-lg border border-status-info/30 bg-status-info-subtle p-3 text-sm">{tokenMsg}</div> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => setInviteOpen(true)}>
          Invite customer
        </Button>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={listTableHeadCellClass}>Email</th>
            <th className={listTableHeadCellClass}>Name</th>
            <th className={listTableHeadCellClass}>Roles</th>
            <th className={listTableHeadCellClass}>Status</th>
            <th className={listTableHeadCellClass}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={listTableRowClass}>
              <td className="px-3 py-2">{r.email}</td>
              <td className="px-3 py-2">{r.full_name}</td>
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
          title="Invite customer user"
          onClose={() => setInviteOpen(false)}
          customers={customers}
          customersLoading={customersLoading}
          roleOptions={CUSTOMER_ROLE_OPTIONS}
          onSubmit={async ({ email, full_name, customer_id, role_code }) => {
            if (customer_id == null || customer_id < 1) {
              throw new Error("Select a customer");
            }
            const res = await api.inviteExternalCustomer({
              email,
              full_name,
              role_codes: [role_code ?? "customer_viewer"],
              customer_ids: [customer_id],
            });
            if (res.invite_email_sent) setTokenMsg(res.message || `Invitation email sent to ${email}.`);
            else if (res.invite_token)
              setTokenMsg(`Invitation created. Email failed, so share token manually: ${res.invite_token}`);
            else setTokenMsg(res.message || "Invitation created.");
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
