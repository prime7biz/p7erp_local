import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ComparativeStatementResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { downloadCsv } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { formatMoney } from "./misFormat";

type Tab = "balance_sheet" | "pl";

function changeColor(pct: number): string {
  if (pct >= 10) return "text-green-700";
  if (pct <= -10) return "text-red-700";
  return "text-gray-700";
}

export function ComparativeStatementsPage() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState<Tab>("balance_sheet");
  const [year1, setYear1] = useState(currentYear - 1);
  const [year2, setYear2] = useState(currentYear);
  const [significantOnly, setSignificantOnly] = useState(false);
  const [data, setData] = useState<ComparativeStatementResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setError("");
      setLoading(true);
      const res =
        tab === "balance_sheet"
          ? await api.getComparativeBalanceSheet({ year1, year2 })
          : await api.getComparativePl({ year1, year2 });
      if (!latest.isCurrent(token)) return;
      setData(res);
    } catch (e) {
      logApiError("ComparativeStatementsPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, tab, year1, year2]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return significantOnly ? data.rows.filter((r) => r.significant) : data.rows;
  }, [data, significantOnly]);

  function exportCsv() {
    if (!data) return;
    const header = ["particulars", `year_${data.year1}`, `year_${data.year2}`, "absolute_change", "percent_change"];
    const lines = rows.map((r) =>
      [r.particulars, r.year1, r.year2, r.absolute_change, r.percent_change].join(","),
    );
    downloadCsv([header.join(","), ...lines].join("\n"), `comparative_${tab}_${year1}_${year2}`);
  }

  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = currentYear; y >= currentYear - 10; y -= 1) ys.push(y);
    return ys;
  }, [currentYear]);

  return (
    <div className="space-y-4 p-4 md:p-6 print-report">
      <AppPageHeader
        title="Comparative Statements"
        description="Year-over-year balance sheet and P&amp;L comparison with change highlighting."
        backTo={{ label: "MIS Dashboard", to: "/app/finance/mis" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={year1}
              onChange={(e) => setYear1(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500">vs</span>
            <select
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={year2}
              onChange={(e) => setYear2(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={significantOnly}
                onChange={(e) => setSignificantOnly(e.target.checked)}
              />
              Significant only (&gt;10%)
            </label>
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={exportCsv}
              disabled={!data}
            >
              Export CSV
            </button>
          </div>
        }
      />

      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            tab === "balance_sheet" ? "border-brand-primary bg-brand-subtle font-medium" : "border-gray-300"
          }`}
          onClick={() => setTab("balance_sheet")}
        >
          Balance Sheet
        </button>
        <button
          type="button"
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            tab === "pl" ? "border-brand-primary bg-brand-subtle font-medium" : "border-gray-300"
          }`}
          onClick={() => setTab("pl")}
        >
          P&amp;L
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && !data ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {data ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Particulars</th>
                <th className="px-3 py-2 font-medium text-right">{data.year1}</th>
                <th className="px-3 py-2 font-medium text-right">{data.year2}</th>
                <th className="px-3 py-2 font-medium text-right">Change</th>
                <th className="px-3 py-2 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.particulars} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-gray-800">{row.particulars}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.year1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.year2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${changeColor(row.percent_change)}`}>
                    {formatMoney(row.absolute_change)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${changeColor(row.percent_change)}`}>
                    {row.percent_change.toFixed(1)}%
                    {row.significant ? " *" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-gray-500">
            {data.significant_count} line(s) with &gt;10% change. * = significant
          </p>
        </div>
      ) : null}
    </div>
  );
}
