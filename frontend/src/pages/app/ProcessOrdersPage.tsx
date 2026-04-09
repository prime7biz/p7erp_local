import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryDocumentPrintPayload,
  type InventoryGlPostingDetail,
  type InventoryItemResponse,
  type ProcessOrderCreate,
  type ProcessOrderResponse,
  type VendorResponse,
  type WarehouseResponse,
} from "@/api/client";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { logApiError } from "@/utils/logApiError";

const PROCESS_TYPES = ["KNITTING", "DYEING", "FINISHING", "CUTTING", "WASHING", "PRINTING"];

function statusBadgeClass(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-surface-subtle text-text-secondary";
    case "ISSUED":
      return "bg-status-info-subtle text-status-info-foreground";
    case "RECEIVED":
      return "bg-status-warning-subtle text-status-warning-foreground";
    case "APPROVED":
      return "bg-status-success-subtle text-status-success-foreground";
    default:
      return "bg-surface-subtle text-text-secondary";
  }
}

function defaultForm(items: InventoryItemResponse[], warehouses: WarehouseResponse[]): ProcessOrderCreate {
  const input = items[0]?.id ?? 0;
  const output = items[1]?.id ?? items[0]?.id ?? 0;
  return {
    process_type: "KNITTING",
    process_method: "in_house",
    input_item_id: input,
    output_item_id: output,
    warehouse_id: warehouses[0]?.id ?? null,
    output_warehouse_id: warehouses[0]?.id ?? null,
    input_quantity: "0",
    expected_output_qty: "0",
    remarks: "",
    process_stage: "",
    prior_process_order_id: null,
    vendor_id: null,
    linked_order_id: null,
    source_bom_id: null,
    source_order_id: null,
    planned_loss_pct: "",
    output_same_as_input: false,
    output_grade: "",
    output_lot_number: "",
  };
}

export function ProcessOrdersPage() {
  const [rows, setRows] = useState<ProcessOrderResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [vendors, setVendors] = useState<VendorResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState({ openPo: 0, openGrn: 0, pendingCr: 0, lowStock: 0 });
  const [prevKpi, setPrevKpi] = useState<{ openPo: number; openGrn: number; pendingCr: number; lowStock: number } | null>(null);
  const [form, setForm] = useState<ProcessOrderCreate>(defaultForm([], []));
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [receiveModal, setReceiveModal] = useState<{
    row: ProcessOrderResponse;
    actual_output_qty: string;
    processing_charges: string;
  } | null>(null);
  const [costModal, setCostModal] = useState<{ processOrderId: number; amount: string; cost_type: string; description: string } | null>(
    null,
  );
  const [costSaving, setCostSaving] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [printTitle, setPrintTitle] = useState("");
  const [printCopyCount, setPrintCopyCount] = useState(1);
  const [printTemplate, setPrintTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const [postingsOpen, setPostingsOpen] = useState(false);
  const [postingsRows, setPostingsRows] = useState<InventoryGlPostingDetail[]>([]);
  const [postingsTitle, setPostingsTitle] = useState("");

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [poRows, itms, whs, vnd] = await Promise.all([
        api.listProcessOrders(),
        api.listInventoryItems(),
        api.listWarehouses(),
        api.listVendorsPaginated({ is_active: true, page: 1, page_size: 500 }),
      ]);
      const [overview, pendingCrRows, stockRows] = await Promise.all([
        api.getInventoryReconciliationOverview(),
        api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
        api.getStockSummary(),
      ]);
      setRows(poRows);
      setItems(itms);
      setWarehouses(whs);
      setVendors(vnd.items);
      const nextKpi = {
        openPo: overview.purchase_orders_open,
        openGrn: overview.goods_receiving_open,
        pendingCr: pendingCrRows.length,
        lowStock: stockRows.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length,
      };
      const prevRaw = localStorage.getItem("p7_inventory_kpi_snapshot");
      if (prevRaw) {
        try {
          setPrevKpi(JSON.parse(prevRaw) as { openPo: number; openGrn: number; pendingCr: number; lowStock: number });
        } catch {
          setPrevKpi(null);
        }
      }
      setKpi(nextKpi);
      localStorage.setItem("p7_inventory_kpi_snapshot", JSON.stringify(nextKpi));
      if (itms.length > 0) {
        setForm((prev) => (prev.input_item_id === 0 ? defaultForm(itms, whs) : prev));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const trend = (key: keyof typeof kpi) => {
    if (!prevKpi) return "";
    if (kpi[key] > prevKpi[key]) return "↑";
    if (kpi[key] < prevKpi[key]) return "↓";
    return "→";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.input_item_id || !form.output_item_id) {
      setError("Please select both input and output items.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: ProcessOrderCreate = {
        ...form,
        prior_process_order_id: form.prior_process_order_id || null,
        vendor_id: form.vendor_id || null,
        linked_order_id: form.linked_order_id || null,
        source_bom_id: form.source_bom_id || null,
        source_order_id: form.source_order_id || null,
        process_stage: form.process_stage?.trim() || null,
        planned_loss_pct: form.planned_loss_pct?.trim() || null,
        output_grade: form.output_grade?.trim() || null,
        output_lot_number: form.output_lot_number?.trim() || null,
      };
      await api.createProcessOrder(payload);
      setForm(defaultForm(items, warehouses));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const issueOrder = async (id: number) => {
    setError(null);
    try {
      await api.issueProcessOrder(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submitReceive = async () => {
    if (!receiveModal) return;
    setError(null);
    try {
      await api.receiveProcessOrder(receiveModal.row.id, {
        actual_output_qty: receiveModal.actual_output_qty,
        processing_charges: receiveModal.processing_charges || "0",
      });
      setReceiveModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const approveOrder = async (id: number) => {
    setError(null);
    try {
      await api.approveProcessOrder(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submitCostLine = async () => {
    if (!costModal) return;
    setCostSaving(true);
    setError(null);
    try {
      await api.addProcessOrderCostLine(costModal.processOrderId, {
        cost_type: costModal.cost_type || "ADD_ON",
        amount: costModal.amount,
        description: costModal.description || null,
      });
      setCostModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCostSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Process Orders</h1>
        <p className="text-sm text-text-muted">
          Multi-stage conversion: input warehouse, output warehouse, subcontractor vendor, prior stage link, and add-on costs before
          receive.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
          <div className="text-text-muted">Open PO</div>
          <div className="text-xl font-semibold">
            {kpi.openPo} <span className="text-xs text-text-muted">{trend("openPo")}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
          <div className="text-text-muted">Open GRN</div>
          <div className="text-xl font-semibold">
            {kpi.openGrn} <span className="text-xs text-text-muted">{trend("openGrn")}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
          <div className="text-text-muted">Pending CR</div>
          <div className="text-xl font-semibold">
            {kpi.pendingCr} <span className="text-xs text-text-muted">{trend("pendingCr")}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
          <div className="text-text-muted">Low Stock Items</div>
          <div className="text-xl font-semibold">
            {kpi.lowStock} <span className="text-xs text-text-muted">{trend("lowStock")}</span>
          </div>
        </div>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Create Process Order</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={submit}>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.process_type}
            onChange={(e) => setForm((prev) => ({ ...prev, process_type: e.target.value }))}
          >
            {PROCESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Process stage label"
            value={form.process_stage ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, process_stage: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            type="number"
            min={0}
            placeholder="Prior process order ID"
            value={form.prior_process_order_id ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                prior_process_order_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.vendor_id ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, vendor_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Vendor / subcontractor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_code} — {v.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(form.input_item_id)}
            onChange={(e) => setForm((prev) => ({ ...prev, input_item_id: Number(e.target.value) }))}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                Input: {i.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(form.output_item_id)}
            onChange={(e) => setForm((prev) => ({ ...prev, output_item_id: Number(e.target.value) }))}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                Output: {i.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-text-secondary md:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(form.output_same_as_input)}
              onChange={(e) => setForm((prev) => ({ ...prev, output_same_as_input: e.target.checked }))}
            />
            Output same as input (state/finish change only)
          </label>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Input qty"
            value={form.input_quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, input_quantity: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Expected output qty"
            value={form.expected_output_qty}
            onChange={(e) => setForm((prev) => ({ ...prev, expected_output_qty: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Planned loss %"
            value={form.planned_loss_pct ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, planned_loss_pct: e.target.value }))}
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(form.warehouse_id ?? "")}
            onChange={(e) => setForm((prev) => ({ ...prev, warehouse_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Input warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(form.output_warehouse_id ?? "")}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, output_warehouse_id: e.target.value ? Number(e.target.value) : null }))
            }
          >
            <option value="">Output warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            type="number"
            min={0}
            placeholder="Linked order ID"
            value={form.linked_order_id ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, linked_order_id: e.target.value ? Number(e.target.value) : null }))
            }
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            type="number"
            min={0}
            placeholder="Source order ID"
            value={form.source_order_id ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, source_order_id: e.target.value ? Number(e.target.value) : null }))
            }
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            type="number"
            min={0}
            placeholder="Source BOM ID"
            value={form.source_bom_id ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, source_bom_id: e.target.value ? Number(e.target.value) : null }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Output grade"
            value={form.output_grade ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, output_grade: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Output lot #"
            value={form.output_lot_number ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, output_lot_number: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Remarks"
            value={form.remarks ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
          />
          <button
            type="submit"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3">Process #</th>
              <th className="px-4 py-3">Type / stage</th>
              <th className="px-4 py-3">Prior</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">WH in → out</th>
              <th className="px-4 py-3">Input</th>
              <th className="px-4 py-3">Output</th>
              <th className="px-4 py-3">Loss</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3 font-medium">{row.process_number}</td>
                <td className="px-4 py-3">
                  {row.process_type}
                  {row.process_stage ? <div className="text-xs text-text-muted">{row.process_stage}</div> : null}
                </td>
                <td className="px-4 py-3 text-xs">{row.prior_process_order_id ? `#${row.prior_process_order_id}` : "—"}</td>
                <td className="px-4 py-3 text-xs">{row.vendor_id ? `#${row.vendor_id}` : "—"}</td>
                <td className="px-4 py-3 text-xs">
                  {row.warehouse_id ?? "—"} → {row.output_warehouse_id ?? "—"}
                </td>
                <td className="px-4 py-3">{itemName.get(row.input_item_id) ?? row.input_item_id}</td>
                <td className="px-4 py-3">{itemName.get(row.output_item_id) ?? row.output_item_id}</td>
                <td className="px-4 py-3 text-xs">
                  {row.planned_loss_pct ? `plan ${row.planned_loss_pct}%` : "—"}
                  {row.actual_loss_qty ? <div>act {row.actual_loss_qty}</div> : null}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="relative inline-block text-left">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((id) => (id === row.id ? null : row.id));
                      }}
                    >
                      Actions
                    </button>
                    {openActionsId === row.id ? (
                      <div
                        className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.status === "DRAFT" ? (
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => {
                              setOpenActionsId(null);
                              void issueOrder(row.id);
                            }}
                          >
                            Issue input
                          </button>
                        ) : null}
                        {row.status === "ISSUED" ? (
                          <>
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setOpenActionsId(null);
                                setCostModal({
                                  processOrderId: row.id,
                                  amount: "0",
                                  cost_type: "ADD_ON",
                                  description: "",
                                });
                              }}
                            >
                              Add cost line
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setOpenActionsId(null);
                                setReceiveModal({
                                  row,
                                  actual_output_qty: row.expected_output_qty || "1",
                                  processing_charges: row.processing_charges || "0",
                                });
                              }}
                            >
                              Receive output
                            </button>
                          </>
                        ) : null}
                        {row.status === "RECEIVED" ? (
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => {
                              setOpenActionsId(null);
                              void approveOrder(row.id);
                            }}
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void (async () => {
                              try {
                                const d = await api.getProcessOrderPrintData(row.id);
                                setPrintData(d);
                                setPrintTitle(row.process_number);
                                setPrintOpen(true);
                              } catch (e) {
                                logApiError("ProcessOrdersPage.print", e);
                                setError((e as Error).message);
                              }
                            })();
                          }}
                        >
                          Print preview
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void (async () => {
                              try {
                                const p = await api.getProcessOrderGlPostings(row.id);
                                setPostingsRows(p);
                                setPostingsTitle(row.process_number);
                                setPostingsOpen(true);
                              } catch (e) {
                                logApiError("ProcessOrdersPage.postings", e);
                                setError((e as Error).message);
                              }
                            })();
                          }}
                        >
                          GL postings
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={10}>
                  No process orders found yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {receiveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-text-primary">Receive output — {receiveModal.row.process_number}</h3>
            <p className="mt-1 text-xs text-text-muted">Add-on cost lines should be added before receive (they roll into output unit cost).</p>
            <label className="mt-3 block text-xs font-medium text-text-secondary">Actual output qty</label>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={receiveModal.actual_output_qty}
              onChange={(e) => setReceiveModal((m) => (m ? { ...m, actual_output_qty: e.target.value } : m))}
            />
            <label className="mt-2 block text-xs font-medium text-text-secondary">Processing charges</label>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={receiveModal.processing_charges}
              onChange={(e) => setReceiveModal((m) => (m ? { ...m, processing_charges: e.target.value } : m))}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setReceiveModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-brand-primary px-3 py-1.5 text-sm text-brand-primary-foreground"
                onClick={() => void submitReceive()}
              >
                Post receive
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {costModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-text-primary">Add process cost line</h3>
            <label className="mt-3 block text-xs font-medium text-text-secondary">Cost type</label>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={costModal.cost_type}
              onChange={(e) => setCostModal((m) => (m ? { ...m, cost_type: e.target.value } : m))}
            />
            <label className="mt-2 block text-xs font-medium text-text-secondary">Amount</label>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={costModal.amount}
              onChange={(e) => setCostModal((m) => (m ? { ...m, amount: e.target.value } : m))}
            />
            <label className="mt-2 block text-xs font-medium text-text-secondary">Description</label>
            <input
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={costModal.description}
              onChange={(e) => setCostModal((m) => (m ? { ...m, description: e.target.value } : m))}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setCostModal(null)} disabled={costSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-brand-primary px-3 py-1.5 text-sm text-brand-primary-foreground disabled:opacity-50"
                disabled={costSaving}
                onClick={() => void submitCostLine()}
              >
                {costSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printOpen && printData ? (
        <PrintPreviewModal
          open={printOpen}
          title={`Print — ${printTitle}`}
          onClose={() => {
            setPrintOpen(false);
            setPrintData(null);
          }}
          copyCount={printCopyCount}
          onCopyCountChange={setPrintCopyCount}
          template={printTemplate}
          onTemplateChange={setPrintTemplate}
        >
          <InventoryDocumentPrintSheets data={printData} copyCount={printCopyCount} template={printTemplate} />
        </PrintPreviewModal>
      ) : null}

      {postingsOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-text-primary">GL postings — {postingsTitle}</h3>
              <button
                type="button"
                className="rounded-lg border border-border px-2 py-1 text-xs"
                onClick={() => setPostingsOpen(false)}
              >
                Close
              </button>
            </div>
            <GlPostingsPanel postings={postingsRows} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
