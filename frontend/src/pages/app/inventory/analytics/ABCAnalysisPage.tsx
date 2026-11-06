import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AbcAnalysisReport } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { downloadBlob } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";

export function ABCAnalysisPage() {
  const [report, setReport] = useState<AbcAnalysisReport | null>(null);
  const [cls, setCls] = useState("");
  const [months, setMonths] = useState(12);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const token = latest.begin();
    setError("");
    try {
      const r = await api.getAbcAnalysisReport({ abc_class: cls || undefined });
      if (latest.isCurrent(token)) setReport(r);
    } catch (e) {
      logApiError("ABCAnalysisPage.load", e);
      if (latest.isCurrent(token)) setError((e as Error).message);
    }
  }, [cls, latest]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setBusy(true);
    setError("");
    try {
      latest.begin();
      const r = await api.runAbcAnalysis(months);
      setReport(r);
    } catch (e) {
      logApiError("ABCAnalysisPage.run", e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setError("");
    try {
      const blob = await api.exportAbcAnalysisCsv({ abc_class: cls || undefined });
      downloadBlob(blob, `abc_analysis${cls ? `_${cls}` : ""}`);
    } catch (e) {
      logApiError("ABCAnalysisPage.exportCsv", e);
      setError((e as Error).message);
    }
  }

  const classes = report?.classes;
  const totalItems = report?.total_items || 1;
  const pie = useMemo(() => {
    if (!classes) return [];
    return (["A", "B", "C"] as const).map((k) => {
      const bucket = classes[k] ?? { item_count: 0, total_value: "0" };
      return {
        key: k,
        count: bucket.item_count,
        value: bucket.total_value,
        pct: Math.round((100 * bucket.item_count) / totalItems),
      };
    });
  }, [classes, totalItems]);

  const colors: Record<string, string> = { A: "#0f766e", B: "#ca8a04", C: "#64748b" };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="ABC Analysis"
        description="Classify items by consumption value — A ~70%, B ~20%, C ~10% of value"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Period (months)
          <input
            type="number"
            className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) || 12)}
          />
        </label>
        <label className="text-sm">
          Class filter
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
          >
            <option value="">All</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run ABC"}
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {pie.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold">Distribution by item count</h2>
            <div className="mt-3 flex h-4 overflow-hidden rounded-full">
              {pie.map((p) => (
                <div
                  key={p.key}
                  style={{ width: `${Math.max(p.pct, p.count ? 2 : 0)}%`, background: colors[p.key] }}
                  title={`${p.key}: ${p.count}`}
                />
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {pie.map((p) => (
                <li key={p.key} className="flex justify-between">
                  <span>
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: colors[p.key] }}
                    />
                    Class {p.key}
                  </span>
                  <span>
                    {p.count} items · value {p.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <p>Total items: {report?.total_items}</p>
            <p>Total value: {report?.total_value}</p>
            <p className="text-gray-500">Period months: {report?.period_months ?? "— (saved classes)"}</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2 text-right">Consumption value</th>
              <th className="px-3 py-2 text-right">% of total</th>
            </tr>
          </thead>
          <tbody>
            {(report?.items || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  No data. Click Run ABC after goods issues exist.
                </td>
              </tr>
            ) : (
              (report?.items || []).map((r) => (
                <tr key={r.item_id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    {r.item_code} — {r.item_name}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: colors[r.abc_class] }}>
                    {r.abc_class}
                  </td>
                  <td className="px-3 py-2 text-right">{r.consumption_value}</td>
                  <td className="px-3 py-2 text-right">{r.pct_of_total}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
