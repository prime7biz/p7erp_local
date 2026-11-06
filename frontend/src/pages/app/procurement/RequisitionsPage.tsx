/**
 * Purchase requisitions list + create (Akij-style procurement: requisition -> quotations -> CS -> PO).
 * Tenant flag: procurement_cs_enabled.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type InventoryItemResponse,
  type RequisitionInput,
  type RequisitionSummary,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";
import { REQUISITION_STATUS_LABEL } from "./requisitionStatus";
import { RequisitionStatusBadge } from "./RequisitionStatusBadge";
import { getWarehousesCached } from "@/lib/masterData";

const CTL = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";

type DraftLine = { item_id: number | ""; warehouse_id: number | ""; quantity: string; estimated_unit_price: string };
const emptyLine = (): DraftLine => ({ item_id: "", warehouse_id: "", quantity: "", estimated_unit_price: "" });

export function RequisitionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RequisitionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [department, setDepartment] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    setError("");
    try {
      const res = await api.listRequisitions({ status: statusFilter || undefined, limit: 100 });
      if (!latest.isCurrent(token)) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      logApiError("RequisitionsPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showCreate || items.length) return;
    void Promise.all([api.listInventoryItemsPaginated({ page: 1, page_size: 500 }), getWarehousesCached()])
      .then(([itm, wh]) => {
        setItems(itm.items);
        setWarehouses(wh);
      })
      .catch((e) => logApiError("RequisitionsPage.masters", e));
  }, [showCreate, items.length]);

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }

  async function save() {
    const valid = lines.filter((ln) => ln.item_id && Number(ln.quantity) > 0);
    if (valid.length === 0) {
      setError("Add at least one line with an item and a quantity.");
      return;
    }
    const body: RequisitionInput = {
      department: department.trim() || null,
      purpose: purpose.trim() || null,
      required_date: requiredDate || null,
      lines: valid.map((ln) => ({
        item_id: Number(ln.item_id),
        warehouse_id: ln.warehouse_id ? Number(ln.warehouse_id) : null,
        quantity: ln.quantity,
        estimated_unit_price: ln.estimated_unit_price || null,
      })),
    };
    setSaving(true);
    setError("");
    try {
      const pr = await api.createRequisition(body);
      navigate(`/app/procurement/requisitions/${pr.id}`);
    } catch (e) {
      logApiError("RequisitionsPage.create", e);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Purchase requisitions"
        description="Request material, get it approved, compare supplier quotations side by side (Comparative Statement), then create the PO."
        actions={
          <button
            type="button"
            className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Close form" : "+ New requisition"}
          </button>
        }
      />

      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      {showCreate ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-5">
          <h2 className="text-base font-semibold text-text-primary">New requisition</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Department</label>
              <input className={CTL} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Merchandising" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Required by</label>
              <input className={CTL} type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Purpose</label>
              <input className={CTL} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Fabric for order 123" />
            </div>
          </div>
          <div className="space-y-2">
            {lines.map((ln, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                <select className={CTL} value={ln.item_id} onChange={(e) => setLine(i, { item_id: e.target.value ? Number(e.target.value) : "" })}>
                  <option value="">Select item…</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.item_code} - {it.name}
                    </option>
                  ))}
                </select>
                <select className={CTL} value={ln.warehouse_id} onChange={(e) => setLine(i, { warehouse_id: e.target.value ? Number(e.target.value) : "" })}>
                  <option value="">Warehouse (optional)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <input className={CTL} type="number" min="0" step="0.0001" placeholder="Quantity" value={ln.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input className={CTL} type="number" min="0" step="0.0001" placeholder="Est. price" value={ln.estimated_unit_price} onChange={(e) => setLine(i, { estimated_unit_price: e.target.value })} />
                <button
                  type="button"
                  className="rounded-lg border border-border-strong px-3 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-40"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="text-sm font-medium text-brand-primary hover:underline" onClick={() => setLines((p) => [...p, emptyLine()])}>
              + Add line
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <select className="rounded-lg border border-border-strong px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(REQUISITION_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-muted">{total} requisition(s)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-3 py-2">Requisition</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Required by</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">No requisitions yet.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-text-primary">{r.pr_code}</td>
                  <td className="px-3 py-2">{r.department ?? "—"}</td>
                  <td className="px-3 py-2">{r.purpose ?? "—"}</td>
                  <td className="px-3 py-2">{r.required_date ?? "—"}</td>
                  <td className="px-3 py-2"><RequisitionStatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <RowActionsMenu
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      items={[
                        { key: "open", label: "Open", href: `/app/procurement/requisitions/${r.id}` },
                        ...(r.purchase_order_id ? [{ key: "po", label: "View PO", href: "/app/inventory/purchase-orders" }] : []),
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
