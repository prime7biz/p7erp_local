import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CostVarianceRow, type OrderCostVarianceResponse } from "@/api/client";
import { formatMoney, toSafeNumber } from "@/features/quotations/workspace/mappers/quotationNumeric";
import { logApiError } from "@/utils/logApiError";

type Props = {
  orderId: number;
  className?: string;
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return formatMoney(toSafeNumber(String(v)));
}

function statusClass(status: string): string {
  if (status === "green") return "bg-status-success-subtle text-status-success-foreground";
  if (status === "yellow") return "bg-status-warning-subtle text-status-warning-foreground";
  if (status === "red") return "bg-status-danger-subtle text-status-danger-foreground";
  return "bg-surface-subtle text-text-muted";
}

function statusLabel(status: string): string {
  if (status === "green") return "OK (≤3%)";
  if (status === "yellow") return "Watch (3–10%)";
  if (status === "red") return "Verify (>10%)";
  return "No data";
}

function sourceLabel(raw: string): string {
  const map: Record<string, string> = {
    quotation_material: "Quotation materials",
    bom_line: "Order BOM",
    purchase_order: "Purchase order",
    grn: "Goods receipt (GRN)",
    none: "None",
  };
  return map[raw] || raw.replace(/_/g, " ");
}

export function CostBreakdownPanel({ orderId, className = "" }: Props) {
  const [data, setData] = useState<OrderCostVarianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedRow, setSelectedRow] = useState<CostVarianceRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await api.getOrderCostVariance(orderId);
        if (!cancelled) setData(res);
      } catch (e) {
        logApiError("CostBreakdownPanel", e);
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load cost variance");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <section
        id="cost-breakdown"
        className={`scroll-mt-20 rounded-xl border border-border bg-surface-raised p-4 text-sm text-text-muted ${className}`}
      >
        Loading cost breakdown…
      </section>
    );
  }

  if (err || !data) {
    return (
      <section
        id="cost-breakdown"
        className={`scroll-mt-20 rounded-xl border border-border bg-surface-raised p-4 text-sm text-status-danger-foreground ${className}`}
      >
        {err || "Unable to load cost variance."}
      </section>
    );
  }

  const margin = data.margin_impact;
  const totals = data.totals;
  const quotedPct = margin.margin_quoted_percent ?? margin.snapshot_profit_percentage;
  const actualPct = margin.margin_actual_percent;

  return (
    <section
      id="cost-breakdown"
      className={`scroll-mt-20 rounded-xl border border-border bg-surface-raised p-4 space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Owner cost visibility</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Tentative (quotation / BOM) vs actual (PO / GRN). Green ≤3%, yellow 3–10%, red &gt;10%. Click a row for
            sources.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(totals.status)}`}>
            {statusLabel(totals.status)}
            {totals.variance_pct != null ? ` · ${totals.variance_pct.toFixed(1)}%` : ""}
          </span>
          <Link to="/app/merch/profitability" className="text-xs font-medium text-status-info hover:underline">
            All orders
          </Link>
        </div>
      </div>

      {(quotedPct != null || actualPct != null) && (
        <p className="rounded-lg border border-border-subtle bg-surface-subtle/60 px-3 py-2 text-sm text-text-secondary">
          {quotedPct != null ? (
            <>
              Quoted at <span className="font-semibold text-text-primary">{quotedPct.toFixed(1)}%</span> margin.
            </>
          ) : (
            "Quoted margin not available."
          )}{" "}
          {actualPct != null ? (
            <>
              With actual costs, margin is now{" "}
              <span className="font-semibold text-text-primary">{actualPct.toFixed(1)}%</span>.
            </>
          ) : null}
        </p>
      )}

      {(margin.snapshot_total_cost != null || margin.snapshot_quoted_price != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg border border-border-subtle p-2">
            <div className="text-text-muted">Quoted price (snap)</div>
            <div className="font-medium text-text-primary">{fmtMoney(margin.snapshot_quoted_price)}</div>
          </div>
          <div className="rounded-lg border border-border-subtle p-2">
            <div className="text-text-muted">Factory cost (snap)</div>
            <div className="font-medium text-text-primary">{fmtMoney(margin.snapshot_total_cost)}</div>
          </div>
          <div className="rounded-lg border border-border-subtle p-2">
            <div className="text-text-muted">Margin at quote</div>
            <div className="font-medium text-text-primary">{fmtMoney(margin.estimated_margin_at_quote)}</div>
          </div>
          <div className="rounded-lg border border-border-subtle p-2">
            <div className="text-text-muted">Margin w/ actuals</div>
            <div className="font-medium text-text-primary">{fmtMoney(margin.estimated_margin_with_actuals)}</div>
          </div>
        </div>
      )}

      {data.rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          No material lines yet. Add quotation materials or a BOM, then raise POs / GRNs to compare costs.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-2 font-medium">Cost Item</th>
                <th className="py-2 pr-2 font-medium text-right">Tentative</th>
                <th className="py-2 pr-2 font-medium text-right">Actual</th>
                <th className="py-2 pr-2 font-medium text-right">Variance</th>
                <th className="py-2 pr-2 font-medium text-right">%</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.line_key}
                  className="border-b border-border-subtle/80 cursor-pointer hover:bg-state-hover/40"
                  onClick={() => setSelectedRow(row)}
                >
                  <td className="py-2 pr-2">
                    <div className="font-medium text-text-primary">
                      {row.description || row.item_code || row.line_key}
                    </div>
                    {row.item_code ? <div className="text-text-muted">{row.item_code}</div> : null}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(row.tentative_cost)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(row.actual_cost)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(row.variance_amount)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {row.variance_pct != null ? `${row.variance_pct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-text-primary">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(totals.tentative_cost)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(totals.actual_cost)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(totals.variance_amount)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {totals.variance_pct != null ? `${totals.variance_pct.toFixed(1)}%` : "—"}
                </td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(totals.status)}`}>
                    {totals.status}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {selectedRow ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setSelectedRow(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface-raised p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {selectedRow.description || selectedRow.item_code || selectedRow.line_key}
                </h3>
                <p className="text-xs text-text-muted">Source documents for this cost line</p>
              </div>
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-state-hover"
                onClick={() => setSelectedRow(null)}
              >
                Close
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-text-muted">Tentative source</dt>
                <dd className="mt-1 font-medium text-text-primary">{sourceLabel(selectedRow.source_tentative)}</dd>
                <dd className="mt-1 tabular-nums text-text-secondary">{fmtMoney(selectedRow.tentative_cost)}</dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-text-muted">Actual source</dt>
                <dd className="mt-1 font-medium text-text-primary">{sourceLabel(selectedRow.source_actual)}</dd>
                <dd className="mt-1 tabular-nums text-text-secondary">{fmtMoney(selectedRow.actual_cost)}</dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-text-muted">Variance</dt>
                <dd className="mt-1 tabular-nums font-medium text-text-primary">
                  {fmtMoney(selectedRow.variance_amount)}
                  {selectedRow.variance_pct != null ? ` (${selectedRow.variance_pct.toFixed(1)}%)` : ""}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
