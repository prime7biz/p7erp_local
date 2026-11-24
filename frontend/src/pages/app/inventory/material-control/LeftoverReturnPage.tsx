import { FormEvent, useState } from "react";
import { postLeftoverReturn } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function LeftoverReturnPage() {
  const embedded = useEmbeddedPage();
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [qty, setQty] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await postLeftoverReturn({
        item_id: Number(itemId),
        warehouse_id: Number(warehouseId),
        qty: qty.trim(),
        order_id: orderId ? Number(orderId) : null,
        request_id: `ui-leftover-${Date.now()}`,
      });
      setMessage(`Leftover return #${res.id} (${res.status}).`);
    } catch (err) {
      logApiError("LeftoverReturnPage.submit", err);
      setError("Could not return leftover (check flag material_conversion_v1).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader title="Leftover return" description="Return bought leftover to store (same item + FIFO)" />
      ) : null}
      <form onSubmit={onSubmit} className="max-w-md space-y-3">
        <label className="block text-sm">
          <span className="text-text-secondary">Item id</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            required
            inputMode="numeric"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Warehouse id</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
            inputMode="numeric"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Qty</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Order id (optional)</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Return to store"}
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
