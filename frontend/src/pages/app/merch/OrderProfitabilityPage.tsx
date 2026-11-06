import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  api,
  type OrderProfitabilitySummaryItem,
  type OrderProfitabilitySummaryPage,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";

function statusClass(status: string): string {
  if (status === "green") return "bg-status-success-subtle text-status-success-foreground";
  if (status === "yellow") return "bg-status-warning-subtle text-status-warning-foreground";
  if (status === "red") return "bg-status-danger-subtle text-status-danger-foreground";
  return "bg-surface-subtle text-text-muted";
}

function MarginSparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-text-muted">—</span>;
  const w = 72;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const falling = values[values.length - 1]! < values[0]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block align-middle" aria-hidden>
      <polyline
        fill="none"
        stroke={falling ? "var(--status-danger, #b91c1c)" : "var(--status-success, #15803d)"}
        strokeWidth="1.5"
        points={pts}
      />
    </svg>
  );
}

const STATUS_FILTERS = [
  { value: "", label: "All variance" },
  { value: "red", label: "Red only" },
  { value: "yellow", label: "Yellow only" },
  { value: "green", label: "Green only" },
];

export function OrderProfitabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const varianceFilter = searchParams.get("status") || "";
  const orderStatus = searchParams.get("order_status") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);

  const [data, setData] = useState<OrderProfitabilitySummaryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    setError("");
    try {
      const res = await api.getOrdersProfitabilitySummary({
        status: orderStatus || undefined,
        page,
        page_size: 25,
      });
      if (!latest.isCurrent(token)) return;
      setData(res);
    } catch (e) {
      logApiError("OrderProfitabilityPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Failed to load profitability");
      setData(null);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, orderStatus, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items: OrderProfitabilitySummaryItem[] = (data?.items ?? []).filter((row) => {
    if (!varianceFilter) return true;
    return row.status === varianceFilter;
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to="/app/orders"
            className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to orders
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Order profitability</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Compare tentative material cost (quotation / BOM) with actuals from POs and GRNs. Trend shows quote →
            actual margin path.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-primary hover:bg-surface-subtle disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setParam("status", f.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs ${
              varianceFilter === f.value
                ? "border-brand-primary bg-brand-primary/10 text-text-primary"
                : "border-border text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-xs text-text-secondary">
          Order status
          <select
            value={orderStatus}
            onChange={(e) => setParam("order_status", e.target.value)}
            className="rounded-lg border border-border-strong px-2 py-1 text-xs"
          >
            <option value="">Any</option>
            <option value="NEW">NEW</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="DRAFT">DRAFT</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle text-xs text-text-muted">
              <th className="px-3 py-2.5 font-medium">Order</th>
              <th className="px-3 py-2.5 font-medium text-right">Quoted margin</th>
              <th className="px-3 py-2.5 font-medium text-right">Actual margin</th>
              <th className="px-3 py-2.5 font-medium text-right">Variance %</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Trend</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-text-muted">
                  No orders match this filter.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.order_id} className="border-b border-border-subtle/80">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-text-primary">{row.order_code}</div>
                    <div className="text-xs text-text-muted">{row.order_status}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.quoted_margin_percent != null ? `${row.quoted_margin_percent.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.actual_margin_percent != null ? `${row.actual_margin_percent.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.variance_pct != null ? `${row.variance_pct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <MarginSparkline values={row.sparkline_data ?? []} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/app/orders/${row.order_id}#cost-breakdown`}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total_pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>
            Page {data.page} of {data.total_pages} ({data.total} orders)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setParam("page", String(page - 1))}
              className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= data.total_pages}
              onClick={() => setParam("page", String(page + 1))}
              className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
