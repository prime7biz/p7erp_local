import { useEffect, useMemo, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type Row = Record<string, unknown>;

function num(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function FinancierStockCollateralPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setData(await financierPortalApi.stockCollateral());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const { grouped, grandTotal, rowCount } = useMemo(() => {
    const items = (data?.items as Row[]) ?? [];
    const m = new Map<string, Row[]>();
    for (const r of items) {
      const id = r.btb_lc_id;
      const k = id != null ? `btb-${String(id)}` : "no-btb";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    const entries = Array.from(m.entries());
    let total = 0;
    for (const r of items) total += num(r.estimated_value_open);
    return { grouped: entries, grandTotal: total, rowCount: items.length };
  }, [data?.items]);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Stock / collateral</h1>
      {data?.note ? <p className="text-sm text-text-muted">{String(data.note)}</p> : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <p className="text-xs font-medium uppercase text-text-muted">Total estimated open collateral value</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      </div>

      {rowCount === 0 && !data?.note ? <p className="text-sm text-text-muted">No rows.</p> : null}

      {grouped.map(([key, rows]) => {
        const sub = rows.reduce((s, r) => s + num(r.estimated_value_open), 0);
        const ref = rows[0]?.btb_lc_reference;
        const title = ref != null ? String(ref) : key === "no-btb" ? "No BTB LC" : key;
        return (
          <section key={key} className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">BTB: {title}</h2>
              <p className="text-xs text-text-muted">
                Subtotal open value:{" "}
                <span className="font-semibold tabular-nums text-text-primary">{sub.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-xs text-text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">PO</th>
                    <th className="px-2 py-2 text-left">Warehouse</th>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-right">Unit price</th>
                    <th className="px-2 py-2 text-right">Open qty</th>
                    <th className="px-2 py-2 text-right">Est. open value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1">{String(r.purchase_order_code ?? "")}</td>
                      <td className="px-2 py-1">{r.warehouse_name != null ? String(r.warehouse_name) : "—"}</td>
                      <td className="px-2 py-1">
                        {String(r.item_code)} — {String(r.item_name)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{num(r.unit_price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{String(r.open_qty)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{num(r.estimated_value_open).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
