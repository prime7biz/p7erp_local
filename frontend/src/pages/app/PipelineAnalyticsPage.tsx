import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PipelineAnalyticsBucket, type PipelineAnalyticsResponse } from "@/api/client";
import { BarChart3, Calendar, RefreshCw, TrendingUp, ArrowLeft } from "lucide-react";

type ViewMode = "month" | "quarter";

/** Format number to at most 2 decimal places (avoids float noise) */
function formatNum(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return Number(value.toFixed(2)).toLocaleString();
}

const MONTHS_TO_SHOW = 24;
const QUARTERS_TO_SHOW = 8;

export function PipelineAnalyticsPage() {
  const [data, setData] = useState<PipelineAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [yearsBack, setYearsBack] = useState(2);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getMerchPipelineAnalytics({ years_back: yearsBack });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [yearsBack]);

  useEffect(() => {
    load();
  }, [load]);

  const buckets = viewMode === "month" ? (data?.by_month ?? []) : (data?.by_quarter ?? []);
  const displayBuckets = viewMode === "month"
    ? buckets.slice(-MONTHS_TO_SHOW)
    : buckets.slice(-QUARTERS_TO_SHOW);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to="/app/merchandising/pipeline"
            className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to pipeline
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Pipeline Analytics</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Month-wise and quarterly picture for marketing: inquiries received, confirmed orders by delivery, under processing, and potential orders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-text-secondary">
            <Calendar className="h-4 w-4" />
            Years back:
          </label>
          <select
            value={yearsBack}
            onChange={(e) => setYearsBack(Number(e.target.value))}
            className="rounded-lg border border-border-strong px-2.5 py-1.5 text-sm"
          >
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="py-12 text-center text-text-muted">Loading analytics…</div>
      ) : !data ? null : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              label="Inquiries received (total)"
              value={data.summary.inquiries_received_total}
              icon={<TrendingUp className="h-5 w-5 text-text-secondary" />}
            />
            <SummaryCard
              label="Confirmed orders (count)"
              value={data.summary.confirmed_orders_total}
              icon={<BarChart3 className="h-5 w-5 text-status-success" />}
            />
            <SummaryCard
              label="Confirmed orders (quantity)"
              value={formatNum(data.summary.confirmed_orders_quantity_total)}
              icon={<BarChart3 className="h-5 w-5 text-status-success" />}
              subLabel="pcs"
            />
            <SummaryCard
              label="Inquiry under processing"
              value={data.summary.inquiry_under_processing_total}
              icon={<RefreshCw className="h-5 w-5 text-status-warning" />}
            />
            <SummaryCard
              label="Potential orders"
              value={data.summary.potential_orders_total}
              icon={<TrendingUp className="h-5 w-5 text-brand-primary" />}
            />
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-surface-subtle p-1">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
                viewMode === "month" ? "bg-surface-raised text-brand-primary shadow" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Month-wise
            </button>
            <button
              type="button"
              onClick={() => setViewMode("quarter")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
                viewMode === "quarter" ? "bg-surface-raised text-brand-primary shadow" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Quarterly
            </button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-surface-subtle">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-text-secondary">Period</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Inquiries received</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Confirmed orders (count)</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Confirmed orders (qty)</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Inquiry under processing</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-secondary">Potential orders</th>
                  </tr>
                </thead>
                <tbody>
                  {displayBuckets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                        No data for the selected period.
                      </td>
                    </tr>
                  ) : (
                    [...displayBuckets].reverse().map((b) => (
                      <AnalyticsRow key={b.period_key} bucket={b} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Short legend */}
          <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-xs text-text-secondary">
            <strong>Definitions:</strong> Inquiries received = count by created month/quarter. Confirmed orders = orders (non-draft) by expected delivery date. Inquiry under processing = inquiries not yet led to an order. Potential orders = quotations sent/approved not yet converted to order.
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  subLabel,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  subLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-text-primary">{value}</span>
        {subLabel && <span className="text-sm text-text-muted">{subLabel}</span>}
      </div>
    </div>
  );
}

function AnalyticsRow({ bucket }: { bucket: PipelineAnalyticsBucket }) {
  const hasAny =
    bucket.inquiries_received > 0 ||
    bucket.confirmed_orders_count > 0 ||
    bucket.confirmed_orders_quantity > 0 ||
    bucket.inquiry_under_processing > 0 ||
    bucket.potential_orders_count > 0;
  return (
    <tr className={`border-b border-border-subtle last:border-0 ${hasAny ? "bg-surface-raised" : "bg-surface-subtle/50"}`}>
      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-text-primary">{bucket.period_label}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
        {bucket.inquiries_received > 0 ? bucket.inquiries_received : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
        {bucket.confirmed_orders_count > 0 ? bucket.confirmed_orders_count : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
        {bucket.confirmed_orders_quantity > 0 ? formatNum(bucket.confirmed_orders_quantity) : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
        {bucket.inquiry_under_processing > 0 ? bucket.inquiry_under_processing : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-secondary">
        {bucket.potential_orders_count > 0 ? bucket.potential_orders_count : "—"}
      </td>
    </tr>
  );
}
