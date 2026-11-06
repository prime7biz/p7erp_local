import { useState } from "react";
import { api, type ProcessLossReportResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { addDaysLocalISO, todayLocalISO } from "@/lib/dates";

function todayIso() {
  return todayLocalISO();
}

function daysAgo(n: number) {
  return addDaysLocalISO(-n);
}

export function ProcessLossReportPage() {
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(todayIso());
  const [processName, setProcessName] = useState("");
  const [report, setReport] = useState<ProcessLossReportResponse | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setReport(
        await api.getProcessLossReport({
          from_date: fromDate,
          to_date: toDate,
          process_name: processName || undefined,
        }),
      );
    } catch (e) {
      logApiError("ProcessLossReportPage.load", e);
      setError((e as Error).message);
    }
  }

  const maxPct = Math.max(
    1,
    ...(report?.rows.map((r) => Number(r.loss_percent) || 0) ?? [1]),
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Process Loss Report"
        description="Compare actual process loss vs standards by department"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          From
          <input
            type="date"
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Process
          <input
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={processName}
            onChange={(e) => setProcessName(e.target.value)}
            placeholder="All"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Run report
        </button>
      </div>

      {report?.rows.length ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-gray-500">Loss % by process</p>
          {report.rows.map((r) => (
            <div key={r.process_name} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0">{r.process_name}</span>
              <div className="h-3 flex-1 rounded bg-gray-100">
                <div
                  className={`h-3 rounded ${
                    r.status === "Alert"
                      ? "bg-red-500"
                      : r.status === "Warning"
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${(Number(r.loss_percent) / maxPct) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right">{r.loss_percent}%</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Process</th>
              <th className="px-3 py-2">Issued</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Loss</th>
              <th className="px-3 py-2">Loss %</th>
              <th className="px-3 py-2">Standard</th>
              <th className="px-3 py-2">Variance</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(report?.rows ?? []).map((r) => (
              <tr
                key={r.process_name}
                className={`border-b ${r.status === "Alert" ? "bg-red-50" : ""}`}
              >
                <td className="px-3 py-2">{r.process_name}</td>
                <td className="px-3 py-2">{r.total_issued}</td>
                <td className="px-3 py-2">{r.total_received}</td>
                <td className="px-3 py-2">{r.total_loss}</td>
                <td className="px-3 py-2">{r.loss_percent}%</td>
                <td className="px-3 py-2">{r.standard_percent}%</td>
                <td className="px-3 py-2">{r.variance_percent}%</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
            {!report?.rows.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Run the report to see results.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
