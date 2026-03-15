import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type WastageReportRowResponse,
  type WastageSummaryByStyle,
  type WastageSummaryResponse,
  type WastageOrderDetailResponse,
  type WastageManagementSummaryResponse,
  type WastageSavedViewResponse,
  type WastageThresholdRuleResponse,
  type CustomerResponse,
} from "@/api/client";

const PREFIX = "/app";
const WASTAGE_THRESHOLD = 15;

function WastageThresholdBadge({ wastagePct, allowedPct }: { wastagePct: number; allowedPct: number }) {
  const breach = wastagePct > allowedPct;
  const critical = wastagePct >= 25;
  const style = critical
    ? "bg-red-100 text-red-800"
    : breach
      ? "bg-amber-100 text-amber-800"
      : "bg-green-100 text-green-800";
  const label = critical ? "Critical" : breach ? "Above threshold" : "Within";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${style}`} title={`Allowed: ${allowedPct}%`}>
      {label}
    </span>
  );
}

export function WastageReportPage() {
  const [rows, setRows] = useState<WastageReportRowResponse[]>([]);
  const [summary, setSummary] = useState<WastageSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState("");
  const [styleId, setStyleId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [thresholdPct, setThresholdPct] = useState("");
  const [aboveThresholdOnly, setAboveThresholdOnly] = useState(false);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [drawerOrderId, setDrawerOrderId] = useState<number | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<WastageOrderDetailResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [trendsMonthly, setTrendsMonthly] = useState<Array<{ label: string; value: number }>>([]);
  const [trendsByBuyer, setTrendsByBuyer] = useState<Array<{ buyer_id: number; buyer_name: string; value: number }>>([]);
  const [exporting, setExporting] = useState(false);
  const [managementSummary, setManagementSummary] = useState<WastageManagementSummaryResponse | null>(null);
  const [savedViews, setSavedViews] = useState<WastageSavedViewResponse[]>([]);
  const [thresholds, setThresholds] = useState<WastageThresholdRuleResponse[]>([]);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false);
  const [refreshingSummary, setRefreshingSummary] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Parameters<typeof api.getWastageReport>[0] = {};
      if (orderId.trim()) params.order_id = Number(orderId);
      if (styleId.trim()) params.style_id = Number(styleId);
      if (buyerId.trim()) params.buyer_id = Number(buyerId);
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (thresholdPct.trim()) params.threshold_pct = Number(thresholdPct);
      if (aboveThresholdOnly) params.above_threshold_only = true;
      const [report, sum, trendsMonth, trendsBuyer, mgmtSummary] = await Promise.all([
        api.getWastageReport(params),
        api.getWastageSummary({
          style_id: styleId.trim() ? Number(styleId) : undefined,
          buyer_id: buyerId.trim() ? Number(buyerId) : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        api.getWastageTrends({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          group_by: "month",
        }),
        api.getWastageTrends({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          group_by: "buyer",
        }),
        api.getWastageManagementSummary({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
      ]);
      setRows(report);
      setSummary(sum);
      setTrendsMonthly(trendsMonth.series ?? []);
      setTrendsByBuyer(trendsBuyer.by_buyer ?? []);
      setManagementSummary(mgmtSummary);
      setLastRefresh(new Date().toLocaleString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wastage report");
      setRows([]);
      setSummary(null);
      setTrendsMonthly([]);
      setTrendsByBuyer([]);
      setManagementSummary(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, styleId, buyerId, dateFrom, dateTo, thresholdPct, aboveThresholdOnly]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    api.getWastageViews().then(setSavedViews).catch(() => setSavedViews([]));
    api.getWastageThresholds().then(setThresholds).catch(() => setThresholds([]));
  }, []);

  const openDrawer = useCallback(async (orderIdParam: number) => {
    setDrawerOrderId(orderIdParam);
    setDrawerDetail(null);
    setDrawerLoading(true);
    try {
      const detail = await api.getWastageOrderDetail(orderIdParam);
      setDrawerDetail(detail);
    } catch {
      setDrawerDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOrderId(null);
    setDrawerDetail(null);
  }, []);

  const applySavedView = useCallback((view: WastageSavedViewResponse) => {
    const f = view.filter_json as Record<string, unknown>;
    if (typeof f.order_id === "number" || typeof f.order_id === "string") setOrderId(String(f.order_id));
    if (typeof f.style_id === "number" || typeof f.style_id === "string") setStyleId(String(f.style_id));
    if (typeof f.buyer_id === "number" || typeof f.buyer_id === "string") setBuyerId(String(f.buyer_id));
    if (typeof f.date_from === "string") setDateFrom(f.date_from);
    if (typeof f.date_to === "string") setDateTo(f.date_to);
    if (typeof f.above_threshold_only === "boolean") setAboveThresholdOnly(f.above_threshold_only);
  }, []);

  const handleSaveCurrentView = useCallback(async () => {
    if (!saveViewName.trim()) return;
    try {
      await api.createWastageView({
        name: saveViewName.trim(),
        filter_json: {
          order_id: orderId.trim() ? Number(orderId) : undefined,
          style_id: styleId.trim() ? Number(styleId) : undefined,
          buyer_id: buyerId.trim() ? Number(buyerId) : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          above_threshold_only: aboveThresholdOnly,
        },
      });
      const views = await api.getWastageViews();
      setSavedViews(views);
      setSaveViewName("");
      setSaveViewModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save view");
    }
  }, [saveViewName, orderId, styleId, buyerId, dateFrom, dateTo, aboveThresholdOnly]);

  const handleRefreshSummary = useCallback(async () => {
    setRefreshingSummary(true);
    try {
      await api.refreshWastageSummary({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh summary failed");
    } finally {
      setRefreshingSummary(false);
    }
  }, [dateFrom, dateTo, load]);

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const blob = await api.getWastageExportBlob({
        order_id: orderId.trim() ? Number(orderId) : undefined,
        style_id: styleId.trim() ? Number(styleId) : undefined,
        buyer_id: buyerId.trim() ? Number(buyerId) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wastage_report.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [orderId, styleId, buyerId, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wastage & Loss Analysis</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Profitability control: planned vs actual consumption by order and item. Positive % = over BOM (wastage).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && <span className="text-sm text-gray-500">Last refresh: {lastRefresh}</span>}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Print / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {(trendsMonthly.length > 0 || trendsByBuyer.length > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Wastage trends</h2>
          {trendsMonthly.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Monthly wastage value</p>
              <div className="flex flex-wrap gap-4 items-end">
                {trendsMonthly.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-600" title={String(s.value)}>
                      {s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <div
                      className="w-10 bg-primary/70 rounded-t min-h-[4px]"
                      style={{ height: `${Math.min(100, (s.value / Math.max(1, ...trendsMonthly.map((x) => x.value))) * 80)}px` }}
                    />
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {trendsByBuyer.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">By buyer</p>
              <ul className="text-sm space-y-1">
                {trendsByBuyer.slice(0, 10).map((b) => (
                  <li key={b.buyer_id} className="flex justify-between gap-2">
                    <span className="text-gray-700 truncate">{b.buyer_name}</span>
                    <span className="font-medium text-gray-900 shrink-0">
                      {b.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total wastage value</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {summary.total_wastage_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fabric wastage % (avg)</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{summary.fabric_wastage_pct_avg.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trim wastage % (avg)</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{summary.trim_wastage_pct_avg.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Orders above threshold</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{summary.above_threshold_orders_count}</p>
          </div>
        </div>
      )}

      {(trendsMonthly.length > 0 || trendsByBuyer.length > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Wastage trends</h2>
          {trendsMonthly.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Monthly wastage value</h3>
              <div className="overflow-x-auto">
                <table className="min-w-[200px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-3 py-1.5">Month</th>
                      <th className="px-3 py-1.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendsMonthly.map((s) => (
                      <tr key={s.label} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-1.5 font-medium text-gray-900">{s.label}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">
                          {s.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {trendsByBuyer.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">By buyer</h3>
              <div className="overflow-x-auto">
                <table className="min-w-[280px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-3 py-1.5">Buyer</th>
                      <th className="px-3 py-1.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendsByBuyer.map((b) => (
                      <tr key={b.buyer_id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-1.5 font-medium text-gray-900">{b.buyer_name}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">
                          {b.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {managementSummary && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Management summary</h2>
            <button
              type="button"
              onClick={handleRefreshSummary}
              disabled={refreshingSummary}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshingSummary ? "Refreshing…" : "Refresh summary"}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {managementSummary.top_orders.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top 10 orders by loss</p>
                <ul className="text-sm space-y-1">
                  {managementSummary.top_orders.slice(0, 10).map((o) => (
                    <li key={o.order_id} className="flex justify-between gap-2">
                      <span className="text-gray-700 truncate">{o.order_code} ({o.buyer_name})</span>
                      <span className="font-medium text-amber-700 shrink-0">
                        {o.total_wastage_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {managementSummary.top_materials.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top 10 materials</p>
                <ul className="text-sm space-y-1">
                  {managementSummary.top_materials.slice(0, 10).map((m) => (
                    <li key={m.item_id} className="flex justify-between gap-2">
                      <span className="text-gray-700 truncate">{m.item_code}</span>
                      <span className="font-medium text-gray-900 shrink-0">
                        {m.total_wastage_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {managementSummary.top_reasons.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top reasons</p>
                <ul className="text-sm space-y-1">
                  {managementSummary.top_reasons.slice(0, 10).map((r, i) => (
                    <li key={r.reason_code || i} className="flex justify-between gap-2">
                      <span className="text-gray-700 truncate">{r.reason_name}</span>
                      <span className="shrink-0">{r.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Month-over-month</p>
              <div className="text-sm space-y-1">
                <p>
                  Current total: <strong>{managementSummary.mom_change.current_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                  {" · "}
                  Above threshold: <strong>{managementSummary.mom_change.current_above_threshold}</strong> orders
                </p>
                <p className="text-gray-600">
                  Previous total: {managementSummary.mom_change.previous_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {" · "}
                  Above threshold: {managementSummary.mom_change.previous_above_threshold} orders
                </p>
              </div>
              {managementSummary.suggested_actions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Suggested actions</p>
                  <ul className="text-sm list-disc list-inside text-gray-700 space-y-0.5">
                    {managementSummary.suggested_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
        <div className="flex flex-wrap items-center gap-3">
          {savedViews.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Saved view:</span>
              <select
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) {
                    const v = savedViews.find((x) => x.id === id);
                    if (v) applySavedView(v);
                  }
                }}
              >
                <option value="">— Select —</option>
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSaveViewModalOpen(true)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Save current view
          </button>
          <input
            type="number"
            placeholder="Order ID"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm w-24"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Style ID"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm w-24"
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
          />
          <select
            className="rounded border border-gray-300 px-2 py-1.5 text-sm min-w-[140px]"
            value={buyerId}
            onChange={(e) => setBuyerId(e.target.value)}
          >
            <option value="">All buyers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <input
            type="number"
            step="0.1"
            placeholder="Min wastage %"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm w-28"
            value={thresholdPct}
            onChange={(e) => setThresholdPct(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={aboveThresholdOnly}
              onChange={(e) => setAboveThresholdOnly(e.target.checked)}
            />
            Above {WASTAGE_THRESHOLD}% only
          </label>
          <button
            type="button"
            onClick={load}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>

      {thresholds.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Threshold rules</h2>
          <p className="text-xs text-gray-500 mb-2">Used to mark orders above allowed wastage % (buyer or tenant-wide).</p>
          <ul className="text-sm space-y-1">
            {thresholds.map((t) => (
              <li key={t.id} className="flex gap-4">
                <span className="font-medium">{t.scope_type}</span>
                {t.scope_id != null && <span>ID: {t.scope_id}</span>}
                <span>Allowed: {t.allowed_pct}%</span>
                <span>Critical: {t.critical_pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary && summary.by_style.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Efficiency by style</h2>
          <div className="overflow-x-auto">
            <table className="min-w-[400px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2">Style ID</th>
                  <th className="px-3 py-2 text-right">Order–item lines</th>
                  <th className="px-3 py-2 text-right">Avg wastage %</th>
                  <th className="px-3 py-2 text-right">Max wastage %</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_style.map((s: WastageSummaryByStyle) => (
                  <tr key={s.style_id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-gray-900">{s.style_id}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{s.order_item_count}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={s.avg_wastage_pct > 10 ? "text-amber-700 font-medium" : "text-gray-700"}>
                        {s.avg_wastage_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={s.max_wastage_pct > 15 ? "text-amber-700 font-medium" : "text-gray-700"}>
                        {s.max_wastage_pct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">Total rows: {summary.total_rows}</p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-900 p-4 pb-0">Detail (order × item)</h2>
        {loading ? (
          <p className="p-4 text-gray-500">Loading…</p>
        ) : (
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500">Buyer</th>
                <th className="px-3 py-2 text-left text-gray-500">Order</th>
                <th className="px-3 py-2 text-left text-gray-500">Style</th>
                <th className="px-3 py-2 text-left text-gray-500">Item</th>
                <th className="px-3 py-2 text-left text-gray-500">Category</th>
                <th className="px-3 py-2 text-right text-gray-500">Expected</th>
                <th className="px-3 py-2 text-right text-gray-500">Actual</th>
                <th className="px-3 py-2 text-right text-gray-500">Wastage %</th>
                <th className="px-3 py-2 text-right text-gray-500">Wastage value</th>
                <th className="px-3 py-2 text-center text-gray-500">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">
                    No data. Ensure orders have a linked quotation with style, a BOM with item-linked lines, and
                    CONSUMPTION_ISSUE movements for those orders.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={`${r.order_id}-${r.item_id}`}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => openDrawer(r.order_id)}
                >
                  <td className="px-3 py-2 text-gray-700">{r.buyer_name}</td>
                  <td className="px-3 py-2 text-gray-900">
                    {r.order_code} <span className="text-gray-400">#{r.order_id}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.style_code}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.item_code} · {r.item_name}
                  </td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{r.category}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {r.expected_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {r.actual_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        r.wastage_pct_vs_bom > 15
                          ? "text-amber-700 font-medium"
                          : r.wastage_pct_vs_bom > 0
                            ? "text-gray-800"
                            : "text-gray-600"
                      }
                    >
                      {r.wastage_pct_vs_bom >= 0 ? "+" : ""}
                      {r.wastage_pct_vs_bom.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {r.wastage_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <WastageThresholdBadge wastagePct={r.wastage_pct_vs_bom} allowedPct={r.allowed_threshold_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {saveViewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label="Save wastage view"
          onClick={() => { setSaveViewModalOpen(false); setSaveViewName(""); }}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Save current view</h3>
            <input
              type="text"
              placeholder="View name"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm mb-3"
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setSaveViewModalOpen(false); setSaveViewName(""); }}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentView}
                disabled={!saveViewName.trim()}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerOrderId != null && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={closeDrawer}
          role="dialog"
          aria-modal="true"
          aria-label="Order wastage detail"
        >
          <div
            className="w-full max-w-2xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Order wastage detail</h3>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              {drawerLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : drawerDetail ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-gray-500">Order</span>
                    <span className="font-medium">{drawerDetail.order_code}</span>
                    <span className="text-gray-500">Buyer</span>
                    <span className="font-medium">{drawerDetail.buyer_name}</span>
                    <span className="text-gray-500">Style</span>
                    <span className="font-medium">{drawerDetail.style_code}</span>
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-medium">{drawerDetail.quantity ?? "—"}</span>
                    <span className="text-gray-500">Total wastage value</span>
                    <span className="font-medium text-amber-700">
                      {drawerDetail.total_wastage_value.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">BOM vs actual</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="py-1 pr-2">Item</th>
                          <th className="py-1 text-right">Expected</th>
                          <th className="py-1 text-right">Actual</th>
                          <th className="py-1 text-right">Variance %</th>
                          <th className="py-1 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drawerDetail.bom_lines.map((line) => (
                          <tr key={line.item_id} className="border-b border-gray-100">
                            <td className="py-1 pr-2">{line.item_code}</td>
                            <td className="py-1 text-right">{line.expected_qty.toFixed(2)}</td>
                            <td className="py-1 text-right">{line.actual_qty.toFixed(2)}</td>
                            <td className="py-1 text-right">
                              {line.wastage_pct_vs_bom >= 0 ? "+" : ""}
                              {line.wastage_pct_vs_bom.toFixed(1)}%
                            </td>
                            <td className="py-1 text-right font-medium">{line.wastage_value.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Process-stage breakdown</h4>
                    {drawerDetail.process_stage_breakdown?.length ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="py-1 pr-2">Stage</th>
                            <th className="py-1 text-right">Value</th>
                            <th className="py-1 text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drawerDetail.process_stage_breakdown.map((s, i) => (
                            <tr key={i} className="border-b border-gray-100">
                              <td className="py-1 pr-2 capitalize">{s.process_stage}</td>
                              <td className="py-1 text-right">{s.value.toFixed(2)}</td>
                              <td className="py-1 text-right">{s.quantity.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-gray-500">No process/reason data captured for this order.</p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Reason breakdown</h4>
                    {drawerDetail.reason_breakdown?.length ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="py-1 pr-2">Reason</th>
                            <th className="py-1 text-right">Value</th>
                            <th className="py-1 text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drawerDetail.reason_breakdown.map((r, i) => (
                            <tr key={i} className="border-b border-gray-100">
                              <td className="py-1 pr-2">{r.reason_name}</td>
                              <td className="py-1 text-right">{r.value.toFixed(2)}</td>
                              <td className="py-1 text-right">{r.quantity.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-gray-500">No process/reason data captured for this order.</p>
                    )}
                  </div>
                  {drawerDetail.linked_alert_ids.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Linked alerts</h4>
                      <ul className="space-y-1">
                        {drawerDetail.linked_alert_ids.map((aid) => (
                          <li key={aid}>
                            <Link
                              to={`${PREFIX}/merchandising/critical-alerts?alert=${aid}`}
                              className="text-primary hover:underline"
                            >
                              Alert #{aid}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">Could not load order detail.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
