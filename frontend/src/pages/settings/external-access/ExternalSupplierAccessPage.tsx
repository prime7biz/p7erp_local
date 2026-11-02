import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { ExternalPrincipalAdminRow } from "@/types/externalAccess";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { Button } from "@/components/ui/button";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { ExternalAccessStatusBadge } from "@/components/external-access/ExternalAccessStatusBadge";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";

const inputClass = "mt-1 w-full rounded-lg border border-border-strong px-2.5 py-1.5 text-sm";

function VendorPicker({ vendors, selected, onChange }: { vendors: { id: number; name: string }[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState("");
  const shown = vendors.filter((v) => v.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50);
  return (
    <div>
      <input aria-label="Search vendors" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className={inputClass} />
      <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border p-1 text-sm">
        {shown.map((v) => (
          <li key={v.id}>
            <label className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-subtle">
              <input
                type="checkbox"
                checked={selected.includes(v.id)}
                onChange={(e) => onChange(e.target.checked ? [...selected, v.id] : selected.filter((x) => x !== v.id))}
              />
              {v.name}
            </label>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-1.5 py-1 text-text-muted">No vendors match.</li> : null}
      </ul>
    </div>
  );
}

export function ExternalSupplierAccessPage() {
  const [rows, setRows] = useState<ExternalPrincipalAdminRow[]>([]);
  const [vendors, setVendors] = useState<{ id: number; name: string }[]>([]);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", vendor_ids: [] as number[] });
  const [editing, setEditing] = useState<{ id: number; vendor_ids: number[] } | null>(null);
  const [tokenMsg, setTokenMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setRows((await api.listExternalSupplierPrincipals()).items);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load supplier users");
    }
  }, []);

  useEffect(() => {
    void load();
    api
      .listVendorsPaginated({ is_active: true, page: 1, page_size: 500 })
      .then((r) => setVendors(r.items.map((v) => ({ id: v.id, name: v.name }))))
      .catch((e) => logApiError("ExternalSupplierAccessPage.vendors", e));
  }, [load]);

  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!form.email.trim() || !form.full_name.trim() || form.vendor_ids.length === 0) {
      toast.error("Enter email and name, and choose at least one vendor");
      return;
    }
    setInviting(true);
    try {
      const res = await api.inviteExternalSupplier({ email: form.email.trim(), full_name: form.full_name.trim(), vendor_ids: form.vendor_ids });
      if (res.invite_email_sent) setTokenMsg(res.message || `Invitation email sent to ${form.email}.`);
      else if (res.invite_token)
        setTokenMsg(`Invitation created. Email failed, so share this link: ${window.location.origin}/portal/supplier/accept-invite?token=${encodeURIComponent(res.invite_token)}`);
      else setTokenMsg(res.message || "Invitation created.");
      setForm({ email: "", full_name: "", vendor_ids: [] });
      await load();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div>
      <AppPageHeader
        title="Supplier portal access"
        description="Invite people at your fabric, trims and service suppliers. They see only purchase orders for the vendors you link, can confirm them and give ship dates."
      />
      <p className="mb-4 text-sm">
        <Link to="/app/settings/external-access" className="text-brand-primary">← Overview</Link>
      </p>
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      {tokenMsg ? <div className="mb-4 break-all rounded-lg border border-status-info/30 bg-status-info-subtle p-3 text-sm">{tokenMsg}</div> : null}

      <form onSubmit={invite} className="mb-6 grid gap-3 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-3">
        <h2 className="text-sm font-semibold text-text-primary md:col-span-3">Invite a supplier user</h2>
        <div>
          <label htmlFor="sup-email" className="text-xs font-medium text-text-muted">Email</label>
          <input id="sup-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          <label htmlFor="sup-name" className="mt-3 block text-xs font-medium text-text-muted">Full name</label>
          <input id="sup-name" required maxLength={255} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <p className="text-xs font-medium text-text-muted">Vendors this person may see ({form.vendor_ids.length} selected)</p>
          <VendorPicker vendors={vendors} selected={form.vendor_ids} onChange={(ids) => setForm({ ...form, vendor_ids: ids })} />
        </div>
        <div className="md:col-span-3">
          <Button type="submit" disabled={inviting}>{inviting ? "Sending…" : "Send invitation"}</Button>
        </div>
      </form>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={listTableHeadCellClass}>Email</th>
            <th className={listTableHeadCellClass}>Name</th>
            <th className={listTableHeadCellClass}>Vendors</th>
            <th className={listTableHeadCellClass}>Last login</th>
            <th className={listTableHeadCellClass}>Status</th>
            <th className={listTableHeadCellClass}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-text-muted">No supplier users yet.</td></tr>
          ) : null}
          {rows.map((r) => (
            <tr key={r.id} className={listTableRowClass}>
              <td className="px-3 py-2">{r.email}</td>
              <td className="px-3 py-2">{r.full_name}</td>
              <td className="px-3 py-2 text-xs text-text-secondary">
                {editing?.id === r.id ? (
                  <div className="min-w-[16rem] space-y-2">
                    <VendorPicker vendors={vendors} selected={editing.vendor_ids} onChange={(ids) => setEditing({ id: r.id, vendor_ids: ids })} />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={editing.vendor_ids.length === 0}
                        onClick={async () => {
                          try {
                            await api.patchExternalSupplierPrincipal(r.id, { vendor_ids: editing.vendor_ids });
                            setEditing(null);
                            await load();
                            toast.success("Vendors updated");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Update failed");
                          }
                        }}
                      >
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  (r.vendor_ids ?? []).map((id) => vendorName.get(id) ?? `#${id}`).join(", ") || "—"
                )}
              </td>
              <td className="px-3 py-2 text-xs text-text-muted">{r.last_login_at ? new Date(`${r.last_login_at}Z`).toLocaleString() : "Never"}</td>
              <td className="px-3 py-2">
                <ExternalAccessStatusBadge variant={r.is_active ? "active" : "inactive"}>{r.is_active ? "Active" : "Inactive"}</ExternalAccessStatusBadge>
              </td>
              <td className="px-3 py-2 text-right">
                <RowActionsMenu
                  rowId={r.id}
                  openId={openId}
                  onOpenChange={setOpenId}
                  items={[
                    { key: "vendors", label: "Change vendors", onClick: () => setEditing({ id: r.id, vendor_ids: r.vendor_ids ?? [] }) },
                    {
                      key: "toggle",
                      label: r.is_active ? "Deactivate" : "Reactivate",
                      danger: r.is_active,
                      onClick: async () => {
                        try {
                          if (r.is_active) await api.deactivateExternalPrincipal(r.id);
                          else await api.reactivateExternalPrincipal(r.id);
                          await load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        }
                      },
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
