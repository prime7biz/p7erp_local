import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type InventoryItemResponse,
  type InterDepartmentTransferCreate,
  type InterDepartmentTransferResponse,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

const PROCESSES = ["Knitting", "Dyeing", "Cutting", "Sewing", "Finishing", "Printing", "AOP"];

export function InterDepartmentTransferPage() {
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [rows, setRows] = useState<InterDepartmentTransferResponse[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<InterDepartmentTransferCreate>({
    from_warehouse_id: 0,
    to_warehouse_id: 0,
    process_name: "Knitting",
    source_item_id: 0,
    source_qty: "100",
    source_qty_unit: "kg",
    target_item_id: 0,
    target_qty_expected: "100",
    target_qty_unit: "kg",
    is_job_work: false,
  });

  async function load() {
    try {
      setError("");
      const [wh, it, idts] = await Promise.all([
        api.listWarehouses(),
        api.listInventoryItems(),
        api.listInterDepartmentTransfers(),
      ]);
      setWarehouses(wh);
      setItems(it);
      setRows(idts);
      setForm((f) => ({
        ...f,
        from_warehouse_id: f.from_warehouse_id || wh[0]?.id || 0,
        to_warehouse_id: f.to_warehouse_id || wh[1]?.id || wh[0]?.id || 0,
        source_item_id: f.source_item_id || it[0]?.id || 0,
        target_item_id: f.target_item_id || it[1]?.id || it[0]?.id || 0,
      }));
    } catch (e) {
      logApiError("InterDepartmentTransferPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      await api.createInterDepartmentTransfer(form);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Inter-Department Transfer"
        description="Issue material to a department (e.g. Yarn → Knitting) and track conversion"
        actions={
          <Link
            to="/app/inventory/idt-receive"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Receive IDTs
          </Link>
        }
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm">
          From department
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.from_warehouse_id}
            onChange={(e) => setForm({ ...form, from_warehouse_id: Number(e.target.value) })}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          To department
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.to_warehouse_id}
            onChange={(e) => setForm({ ...form, to_warehouse_id: Number(e.target.value) })}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Process
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.process_name}
            onChange={(e) => setForm({ ...form, process_name: e.target.value })}
          >
            {PROCESSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Linked order ID (optional)
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.linked_order_id ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                linked_order_id: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="text-sm">
          Source item
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.source_item_id}
            onChange={(e) => setForm({ ...form, source_item_id: Number(e.target.value) })}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.item_code} — {it.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Source qty
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.source_qty}
            onChange={(e) => setForm({ ...form, source_qty: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Target item
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.target_item_id}
            onChange={(e) => setForm({ ...form, target_item_id: Number(e.target.value) })}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.item_code} — {it.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Expected qty
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.target_qty_expected}
            onChange={(e) => setForm({ ...form, target_qty_expected: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={!!form.is_job_work}
            onChange={(e) => setForm({ ...form, is_job_work: e.target.checked })}
          />
          Job work (outsourced)
        </label>
        {form.is_job_work ? (
          <>
            <label className="text-sm">
              Job work vendor ID
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
                value={form.job_work_vendor_id ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    job_work_vendor_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <label className="text-sm">
              Cost / unit
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
                value={form.job_work_cost_per_unit ?? ""}
                onChange={(e) => setForm({ ...form, job_work_cost_per_unit: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Transport cost
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
                value={form.transport_cost ?? ""}
                onChange={(e) => setForm({ ...form, transport_cost: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Other charges
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5"
                value={form.other_charges ?? ""}
                onChange={(e) => setForm({ ...form, other_charges: e.target.value })}
              />
            </label>
          </>
        ) : null}
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Create transfer (issue stock)
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">IDT</th>
              <th className="px-3 py-2">Process</th>
              <th className="px-3 py-2">Source → Target</th>
              <th className="px-3 py-2">Issued</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">{r.idt_number}</td>
                <td className="px-3 py-2">{r.process_name}</td>
                <td className="px-3 py-2">
                  {r.source_item_id} → {r.target_item_id}
                </td>
                <td className="px-3 py-2">
                  {r.source_qty_issued} {r.source_qty_unit}
                </td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
