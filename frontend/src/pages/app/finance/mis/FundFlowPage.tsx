import { useEffect, useState } from "react";
import { api, type FundFlowResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";
import { formatMoney } from "./misFormat";

export function FundFlowPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<FundFlowResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setError("");
      setLoading(true);
      setData(await api.getFundFlowReport({ from_date: fromDate, to_date: toDate }));
    } catch (e) {
      logApiError("FundFlowPage.load", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  function exportCsv() {
    if (!data) return;
    const lines: string[] = ["section,item,amount,percent_of_total"];
    for (const row of data.sources) {
      lines.push(["Sources", row.item, row.amount, row.percent_of_total].join(","));
    }
    for (const row of data.applications) {
      lines.push(["Applications", row.item, row.amount, row.percent_of_total].join(","));
    }
    lines.push(["Summary", "Net change", data.net_change, ""].join(","));
    downloadCsv(lines.join("\n"), "fund_flow_report");
  }

  function renderColumn(
    title: string,
    rows: FundFlowResponse["sources"],
    total: number,
  ) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500">Total: {formatMoney(total)}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item} className="border-b border-gray-50">
                <td className="px-3 py-2 text-gray-700">{row.item}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatMoney(row.amount)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{row.percent_of_total.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 print-report">
      <div className="print-only mb-3 border-b border-gray-200 pb-2">
        <h1 className="text-lg font-semibold">Fund Flow Statement</h1>
        <p className="text-xs text-gray-500">
          {fromDate} to {toDate}
        </p>
      </div>

      <AppPageHeader
        title="Fund Flow Statement"
        description="Sources and applications of funds for the selected period (read-only from chart of accounts)."
        backTo={{ label: "MIS Dashboard", to: "/app/finance/mis" }}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => printCurrentPage()}
            >
              Print
            </button>
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

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && !data ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {renderColumn("Sources of funds", data.sources, data.total_sources)}
            {renderColumn("Application of funds", data.applications, data.total_application)}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <span className="font-medium text-gray-800">Net change in working capital / funds: </span>
            <span className="font-semibold tabular-nums text-gray-900">{formatMoney(data.net_change)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
