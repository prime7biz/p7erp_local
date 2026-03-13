import { useEffect, useMemo, useState } from "react";
import { api, type InventoryItemResponse, type ProcessOrderCreate, type WarehouseResponse } from "@/api/client";

const PROCESS_TYPES = ["KNITTING", "DYEING", "FINISHING", "CUTTING", "WASHING", "PRINTING"];

function statusBadgeClass(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700";
    case "ISSUED":
      return "bg-blue-100 text-blue-700";
    case "RECEIVED":
      return "bg-amber-100 text-amber-700";
    case "APPROVED":
      return "bg-green-100 text-green-700";
    default:
      return "bg-slate-100 text-slate-700";
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
    input_quantity: "0",
    expected_output_qty: "0",
    remarks: "",
  };
}

export function ProcessOrdersPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listProcessOrders>>>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState({ openPo: 0, openGrn: 0, pendingCr: 0, lowStock: 0 });
  const [prevKpi, setPrevKpi] = useState<{ openPo: number; openGrn: number; pendingCr: number; lowStock: number } | null>(null);
  const [form, setForm] = useState<ProcessOrderCreate>({
    process_type: "KNITTING",
    process_method: "in_house",
    input_item_id: 0,
    output_item_id: 0,
    warehouse_id: null,
    input_quantity: "0",
    expected_output_qty: "0",
    remarks: "",
  });

  const load = async () => {
    setError(null);
    try {
      const [poRows, itms, whs] = await Promise.all([
        api.listProcessOrders(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      const [overview, pendingCrRows, stockRows] = await Promise.all([
        api.getInventoryReconciliationOverview(),
        api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
        api.getStockSummary(),
      ]);
      setRows(poRows);
      setItems(itms);
      setWarehouses(whs);
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
      if (form.input_item_id === 0 && itms.length > 0) {
        setForm(defaultForm(itms, whs));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
      await api.createProcessOrder(form);
      setForm(defaultForm(items, warehouses));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (id: number, action: "issue" | "receive" | "approve") => {
    setError(null);
    try {
      if (action === "issue") await api.issueProcessOrder(id);
      if (action === "receive") await api.receiveProcessOrder(id, { actual_output_qty: "0", processing_charges: "0" });
      if (action === "approve") await api.approveProcessOrder(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Process Orders</h1>
        <p className="text-sm text-slate-500">Track conversion flow from input material to output material.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Open PO</div><div className="text-xl font-semibold">{kpi.openPo} <span className="text-xs text-slate-400">{trend("openPo")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Open GRN</div><div className="text-xl font-semibold">{kpi.openGrn} <span className="text-xs text-slate-400">{trend("openGrn")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Pending CR</div><div className="text-xl font-semibold">{kpi.pendingCr} <span className="text-xs text-slate-400">{trend("pendingCr")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Low Stock Items</div><div className="text-xl font-semibold">{kpi.lowStock} <span className="text-xs text-slate-400">{trend("lowStock")}</span></div></div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create Process Order</h2>
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
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(form.warehouse_id ?? "")}
            onChange={(e) => setForm((prev) => ({ ...prev, warehouse_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Warehouse (optional)</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Remarks"
            value={form.remarks ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
          />
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60" disabled={saving} type="submit">
            {saving ? "Saving..." : "Create"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Process #</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Input</th>
              <th className="px-4 py-3">Output</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-3 font-medium">{row.process_number}</td>
                <td className="px-4 py-3">{row.process_type}</td>
                <td className="px-4 py-3">{itemName.get(row.input_item_id) ?? row.input_item_id}</td>
                <td className="px-4 py-3">{itemName.get(row.output_item_id) ?? row.output_item_id}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {row.status === "DRAFT" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void changeStatus(row.id, "issue")}>
                        Issue
                      </button>
                    ) : null}
                    {row.status === "ISSUED" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void changeStatus(row.id, "receive")}>
                        Receive
                      </button>
                    ) : null}
                    {row.status === "RECEIVED" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void changeStatus(row.id, "approve")}>
                        Approve
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                  No process orders found yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

