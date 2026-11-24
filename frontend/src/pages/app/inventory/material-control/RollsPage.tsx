import { FormEvent, useState } from "react";
import { fetchMaterialRolls, postMaterialRoll } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function RollsPage() {
  const embedded = useEmbeddedPage();
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [qty, setQty] = useState("");
  const [shadeBand, setShadeBand] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Array<{ id: number; roll_code: string; shade_band?: string | null; qty_remaining: string }>>([]);

  async function refresh() {
    if (!itemId || !warehouseId) return;
    try {
      const res = await fetchMaterialRolls({
        item_id: Number(itemId),
        warehouse_id: Number(warehouseId),
      });
      setList(res.items);
    } catch (err) {
      logApiError("RollsPage.refresh", err);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await postMaterialRoll({
        item_id: Number(itemId),
        warehouse_id: Number(warehouseId),
        qty: qty.trim(),
        shade_band: shadeBand.trim() || null,
        width_cm: widthCm.trim() || null,
        request_id: `ui-roll-${Date.now()}`,
      });
      setMessage(`Roll ${res.roll_code} created (${res.status}).`);
      await refresh();
    } catch (err) {
      logApiError("RollsPage.submit", err);
      setError("Could not create roll (need material_budget_plan_v1).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader title="Rolls & shade" description="Register fabric rolls with shade band and width" />
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
          <span className="text-text-secondary">Shade band</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={shadeBand}
            onChange={(e) => setShadeBand(e.target.value)}
            placeholder="e.g. A"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Width (cm)</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Create roll"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded border border-border px-3 py-1.5 text-sm"
          >
            List available
          </button>
        </div>
      </form>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {list.length > 0 ? (
        <ul className="text-sm space-y-1">
          {list.map((r) => (
            <li key={r.id}>
              {r.roll_code} — shade {r.shade_band || "—"} — rem {r.qty_remaining}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
