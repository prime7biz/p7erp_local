import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type LotTraceResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function LotTraceabilityPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<LotTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    const lot = q.trim();
    if (!lot) {
      setError("Enter a lot number");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      setData(await api.traceLotNumber(lot));
    } catch (e) {
      logApiError("LotTraceabilityPage.traceLotNumber", e);
      setError(e instanceof Error ? e.message : "Trace failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Lot Traceability</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Trace a lot from goods receiving lines through stock movements (same tenant).
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[240px] rounded border border-border-strong px-3 py-2 text-sm"
          placeholder="Lot / batch number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
        />
        <button
          type="button"
          className="rounded bg-brand-primary px-4 py-2 text-sm text-brand-primary-foreground"
          onClick={() => void run()}
        >
          {loading ? "Searching…" : "Trace"}
        </button>
      </div>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {data && (
        <>
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <h2 className="font-semibold">Lot: {data.lot_number}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {data.grn_lines.length} GRN line(s), {data.movements.length} stock movement(s).
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h3 className="border-b border-border px-4 py-2 text-sm font-semibold">Goods receiving</h3>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">GRN</th>
                  <th className="py-2 px-4">Received</th>
                  <th className="py-2 px-4">Item</th>
                  <th className="py-2 px-4">Qty</th>
                  <th className="py-2 px-4">WH</th>
                </tr>
              </thead>
              <tbody>
                {data.grn_lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-text-muted">
                      No GRN lines
                    </td>
                  </tr>
                ) : (
                  data.grn_lines.map((g) => (
                    <tr key={`${g.grn_id}-${g.item_id}`} className="border-b border-border-subtle">
                      <td className="py-2 px-4">
                        <Link to="/app/inventory/goods-receiving" className="text-brand-primary hover:underline">
                          {g.grn_code}
                        </Link>
                      </td>
                      <td className="py-2 px-4">{g.received_date ? new Date(g.received_date).toLocaleDateString() : "—"}</td>
                      <td className="py-2 px-4">{g.item_id}</td>
                      <td className="py-2 px-4">{g.quantity}</td>
                      <td className="py-2 px-4">{g.warehouse_id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h3 className="border-b border-border px-4 py-2 text-sm font-semibold">Stock movements</h3>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">ID</th>
                  <th className="py-2 px-4">Type</th>
                  <th className="py-2 px-4">Qty</th>
                  <th className="py-2 px-4">Item</th>
                  <th className="py-2 px-4">Ref</th>
                  <th className="py-2 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-text-muted">
                      No movements
                    </td>
                  </tr>
                ) : (
                  data.movements.map((m) => (
                    <tr key={m.id} className="border-b border-border-subtle">
                      <td className="py-2 px-4">{m.id}</td>
                      <td className="py-2 px-4">{m.movement_type}</td>
                      <td className="py-2 px-4">{m.quantity}</td>
                      <td className="py-2 px-4">{m.item_id}</td>
                      <td className="py-2 px-4 text-xs">
                        {m.reference_type ?? "—"} {m.reference_id ?? ""}
                      </td>
                      <td className="py-2 px-4">{m.movement_date ? new Date(m.movement_date).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
