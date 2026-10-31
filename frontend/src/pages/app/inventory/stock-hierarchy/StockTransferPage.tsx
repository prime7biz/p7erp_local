import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryItemResponse,
  type StockBatchRow,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

type LineDraft = {
  stock_item_id: number;
  batch_id: number | null;
  qty: string;
  available?: string;
};

export function StockTransferPage() {
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [itemId, setItemId] = useState<number | "">("");
  const [batches, setBatches] = useState<StockBatchRow[]>([]);
  const [batchId, setBatchId] = useState<number | "">("");
  const [qty, setQty] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [autoFifo, setAutoFifo] = useState(true);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void Promise.all([api.listWarehouses(), api.listInventoryItems()])
      .then(([wh, it]) => {
        setWarehouses(wh.filter((w) => w.is_active));
        setItems(it);
      })
      .catch((e) => {
        logApiError("StockTransferPage.bootstrap", e);
        setError((e as Error).message);
      });
  }, []);

  useEffect(() => {
    if (!itemId || !fromId) {
      setBatches([]);
      return;
    }
    void api
      .listStockItemBatches(Number(itemId), Number(fromId))
      .then((rows) => {
        setBatches(rows);
        if (autoFifo && rows.length) {
          const oldest = rows[0]!;
          setBatchId(oldest.id ?? oldest.batch_id ?? "");
          setQty(oldest.current_qty);
        }
      })
      .catch((e) => {
        // Batch API 404 when batch_tracking flag off — still allow qty-only transfer
        logApiError("StockTransferPage.batches", e);
        setBatches([]);
      });
  }, [itemId, fromId, autoFifo]);

  const itemName = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, `${i.item_code} — ${i.name}`]));
    return m;
  }, [items]);

  function addLine() {
    if (!itemId || !qty || Number(qty) <= 0) {
      setError("Select an item and enter a positive qty.");
      return;
    }
    setError("");
    setLines((prev) => [
      ...prev,
      {
        stock_item_id: Number(itemId),
        batch_id: batchId ? Number(batchId) : null,
        qty,
        available: batches.find((b) => (b.id ?? b.batch_id) === batchId)?.current_qty,
      },
    ]);
    setQty("0");
    setBatchId("");
  }

  async function confirmTransfer(e: FormEvent) {
    e.preventDefault();
    if (!fromId || !toId || fromId === toId) {
      setError("Choose different From and To godowns.");
      return;
    }
    if (!lines.length) {
      setError("Add at least one line.");
      return;
    }
    if (!preview) {
      setPreview(true);
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      setSuccess("");
      const res = await api.createStockTransfer({
        from_godown_id: Number(fromId),
        to_godown_id: Number(toId),
        items: lines.map((l) => ({
          stock_item_id: l.stock_item_id,
          batch_id: l.batch_id,
          qty: l.qty,
        })),
        notes: notes || null,
        auto_fifo: autoFifo,
      });
      setSuccess(`Transfer ${res.transfer_code} posted.`);
      setLines([]);
      setPreview(false);
      setNotes("");
    } catch (err) {
      logApiError("StockTransferPage.confirm", err);
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Stock Transfer"
        description="Move stock between godowns (no GL impact). Auto-FIFO suggests oldest batches."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <form onSubmit={confirmTransfer} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-600">
            From godown
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={fromId}
              onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.warehouse_code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            To godown
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={toId}
              onChange={(e) => setToId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.warehouse_code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-xs text-gray-700 pb-2">
            <input type="checkbox" checked={autoFifo} onChange={(e) => setAutoFifo(e.target.checked)} />
            Auto-FIFO (oldest batch)
          </label>
          <label className="text-xs text-gray-600">
            Notes
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={itemId}
            onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Item…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.item_code} — {it.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Batch (optional)…</option>
            {batches.map((b) => (
              <option key={b.id ?? b.batch_id} value={b.id ?? b.batch_id}>
                {b.batch_number} · qty {b.current_qty}
                {b.expiry_date ? ` · exp ${b.expiry_date}` : ""}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <button
            type="button"
            onClick={addLine}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Add line
          </button>
        </div>

        {lines.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.stock_item_id}-${i}`} className="border-t border-gray-100">
                    <td className="px-3 py-2">{itemName.get(l.stock_item_id) ?? l.stock_item_id}</td>
                    <td className="px-3 py-2">{l.batch_id ?? (autoFifo ? "Auto-FIFO" : "—")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {preview ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Preview: move {lines.length} line(s) from godown #{fromId} → #{toId}. Click again to confirm.
          </div>
        ) : null}

        <div className="flex gap-2">
          {preview ? (
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setPreview(false)}
            >
              Back
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Posting…" : preview ? "Confirm transfer" : "Preview transfer"}
          </button>
        </div>
      </form>
    </div>
  );
}
