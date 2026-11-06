import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type StockBatchRow, type WarehouseResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { getWarehousesCached } from "@/lib/masterData";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { fetchStockItemPage, hydrateStockItem } from "@/lib/remoteSelectFetchers";

type ItemRow = { stock_item_id: string; qty: string; batch_id: string };

export function StockTransferCreatePage() {
  const navigate = useNavigate();
  const [godowns, setGodowns] = useState<WarehouseResponse[]>([]);
  const [batchesByItem, setBatchesByItem] = useState<Record<number, StockBatchRow[]>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    from_godown_id: "",
    to_godown_id: "",
    notes: "",
  });
  const [rows, setRows] = useState<ItemRow[]>([{ stock_item_id: "", qty: "", batch_id: "" }]);

  useEffect(() => {
    void getWarehousesCached()
      .then((wh) => {
        setGodowns(wh);
      })
      .catch((e) => {
        logApiError("StockTransferCreatePage.init", e);
        setError((e as Error).message);
      });
  }, []);

  async function loadBatches(itemId: number, godownId?: number) {
    if (!itemId) return;
    try {
      const batches = await api.listStockItemBatches(itemId, godownId);
      setBatchesByItem((prev) => ({ ...prev, [itemId]: batches }));
    } catch (e) {
      logApiError("StockTransferCreatePage.batches", e);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.from_godown_id === form.to_godown_id) {
      setError("From and to godown must differ.");
      return;
    }
    const validItems = rows
      .filter((r) => r.stock_item_id && r.qty.trim())
      .map((r) => ({
        stock_item_id: Number(r.stock_item_id),
        qty: r.qty,
        batch_id: r.batch_id ? Number(r.batch_id) : null,
      }));
    if (!validItems.length) {
      setError("Add at least one item row.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      const res = await api.createFinanceStockTransferVoucher({
        from_godown_id: Number(form.from_godown_id),
        to_godown_id: Number(form.to_godown_id),
        items: validItems,
        notes: form.notes || null,
        auto_fifo: true,
      });
      const voucherId = res.voucher_id as number | undefined;
      if (voucherId) {
        navigate(`/app/accounts/vouchers?edit=${voucherId}`);
      } else {
        setError("Stock transfer created but no voucher id returned.");
      }
    } catch (err) {
      logApiError("StockTransferCreatePage.submit", err);
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Stock Transfer Voucher"
        description="Create a finance stock transfer voucher between godowns."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="max-w-3xl space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-600">
            From godown
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.from_godown_id}
              onChange={(e) => setForm((p) => ({ ...p, from_godown_id: e.target.value }))}
              required
            >
              <option value="">Select…</option>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.warehouse_code} — {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            To godown
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.to_godown_id}
              onChange={(e) => setForm((p) => ({ ...p, to_godown_id: e.target.value }))}
              required
            >
              <option value="">Select…</option>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.warehouse_code} — {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            Notes
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Items</p>
          {rows.map((row, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-4">
              <RemoteSearchSelect
                className="sm:col-span-2"
                value={row.stock_item_id ? Number(row.stock_item_id) : ""}
                onChange={(picked) => {
                  const value = picked === "" ? "" : String(picked);
                  const next = [...rows];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, stock_item_id: value, batch_id: "" };
                  setRows(next);
                  if (value) {
                    void loadBatches(Number(value), form.from_godown_id ? Number(form.from_godown_id) : undefined);
                  }
                }}
                fetchPage={fetchStockItemPage}
                hydrateById={hydrateStockItem}
                placeholder="Stock item…"
                aria-label="Stock item"
                menuPortal
              />
              <input
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Qty"
                value={row.qty}
                onChange={(e) => {
                  const next = [...rows];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, qty: e.target.value };
                  setRows(next);
                }}
              />
              <div className="flex gap-1">
                <select
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  value={row.batch_id}
                  onChange={(e) => {
                    const next = [...rows];
                    const cur = next[idx];
                    if (!cur) return;
                    next[idx] = { ...cur, batch_id: e.target.value };
                    setRows(next);
                  }}
                >
                  <option value="">Batch (optional)</option>
                  {(batchesByItem[Number(row.stock_item_id)] ?? []).map((b) => {
                    const bid = b.id ?? b.batch_id ?? 0;
                    return (
                      <option key={bid} value={bid}>
                        {b.batch_number} ({b.current_qty})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-2 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            onClick={() => setRows([...rows, { stock_item_id: "", qty: "", batch_id: "" }])}
          >
            + Add item
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create stock transfer voucher"}
        </button>
      </form>
    </div>
  );
}
