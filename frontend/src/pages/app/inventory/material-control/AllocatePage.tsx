import { FormEvent, useState } from "react";
import { postAllocation } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function AllocatePage() {
  const embedded = useEmbeddedPage();
  const [costLayerId, setCostLayerId] = useState("");
  const [qty, setQty] = useState("");
  const [orderId, setOrderId] = useState("");
  const [styleId, setStyleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await postAllocation({
        cost_layer_id: Number(costLayerId),
        qty: qty.trim(),
        order_id: orderId ? Number(orderId) : null,
        style_id: styleId ? Number(styleId) : null,
        request_id: `ui-alloc-${Date.now()}`,
      });
      setMessage(`Allocated #${res.id} (${res.status}).`);
    } catch (err) {
      logApiError("AllocatePage.submit", err);
      setError("Could not allocate (check flag material_alloc_ud_v1 and layer qty).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader title="Allocate FIFO layer" description="Reserve shared stock to an order / style" />
      ) : null}
      <form onSubmit={onSubmit} className="max-w-md space-y-3">
        <label className="block text-sm">
          <span className="text-text-secondary">Cost layer id</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={costLayerId}
            onChange={(e) => setCostLayerId(e.target.value)}
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
        <label className="block text-sm">
          <span className="text-text-secondary">Style id (optional)</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Allocate"}
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
