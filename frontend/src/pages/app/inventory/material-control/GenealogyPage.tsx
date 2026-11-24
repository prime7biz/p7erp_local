import { FormEvent, useState } from "react";
import { fetchMaterialGenealogy, type GenealogyResponse } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function GenealogyPage() {
  const embedded = useEmbeddedPage();
  const [lot, setLot] = useState("");
  const [data, setData] = useState<GenealogyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = lot.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMaterialGenealogy(value);
      setData(res);
    } catch (err) {
      logApiError("GenealogyPage.search", err);
      setError("Could not trace this lot.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader title="Genealogy" description="Trace a lot from GRN through stock movements" />
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Lot number</label>
          <input
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            placeholder="e.g. LOT-001"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !lot.trim()}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Searching…" : "Trace"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {data ? (
        <>
          <p className="text-sm text-text-secondary">
            Lot <span className="font-medium text-text-primary">{data.lot_number}</span> — {data.grn_line_count}{" "}
            GRN line(s), {data.movements.length} movement(s)
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Order</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text-secondary">{m.movement_date ?? "—"}</td>
                    <td className="px-3 py-2">{m.movement_type ?? "—"}</td>
                    <td className="px-3 py-2">{m.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{m.item_id ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      {m.reference_type ?? "—"}
                      {m.reference_id != null ? ` #${m.reference_id}` : ""}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{m.order_id ?? "—"}</td>
                  </tr>
                ))}
                {data.movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-text-muted">
                      No stock movements for this lot.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
