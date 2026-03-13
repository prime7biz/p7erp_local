import { useEffect, useState } from "react";
import { api, type CashFlowStatementResponse, type CashForecastScenarioResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function CashFlowReportPage() {
  const [mode, setMode] = useState<"statement" | "forecast">("statement");
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [statement, setStatement] = useState<CashFlowStatementResponse | null>(null);
  const [rows, setRows] = useState<CashForecastScenarioResponse[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      if (mode === "statement") {
        setStatement(await api.getCashFlowStatement({ from_date: fromDate, to_date: toDate }));
      } else {
        setRows(await api.listCashForecastScenarios());
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fromDate, toDate]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function exportCsv() {
    if (mode === "statement") {
      const headers = ["section", "voucher_number", "voucher_date", "description", "inflow", "outflow", "net"];
      const lines: string[] = [];
      const sectionKeys: Array<"operating" | "investing" | "financing"> = ["operating", "investing", "financing"];
      for (const key of sectionKeys) {
        for (const line of statement?.sections[key].rows ?? []) {
          lines.push(
            [
              key,
              line.voucher_number,
              line.voucher_date,
              (line.description ?? "").replaceAll(",", " "),
              String(line.inflow),
              String(line.outflow),
              String(line.net),
            ].join(",")
          );
        }
      }
      const csv = [headers.join(","), ...lines].join("\n");
      downloadCsv(csv, "cash_flow_statement");
      setSuccess("Cash Flow statement exported successfully.");
      return;
    }

    const headers = ["scenario", "status", "month", "inflow", "outflow", "net", "cumulative"];
    const lines: string[] = [];
    for (const scenario of rows) {
      for (const line of scenario.lines) {
        lines.push(
          [
            scenario.name.replaceAll(",", " "),
            scenario.status,
            line.month_label,
            String(line.inflow),
            String(line.outflow),
            String(line.net),
            String(line.cumulative),
          ].join(",")
        );
      }
    }
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "cash_flow_report");
    setSuccess("Cash Flow forecast exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Cash Flow print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Cash Flow Report</h1>
        <p className="text-xs text-slate-600">
          Mode: {mode === "statement" ? "Statement" : "Forecast"}
          {mode === "statement" ? ` | Period: ${fromDate} to ${toDate}` : ""}
        </p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold text-slate-900">Cash Flow Report</h1>
          <p className="text-sm text-slate-500">Accounting statement view plus forecast scenario planning view.</p>
        </div>
        <button className={`rounded border px-3 py-2 text-sm ${mode === "statement" ? "bg-slate-900 text-white" : ""}`} onClick={() => setMode("statement")}>Statement</button>
        <button className={`rounded border px-3 py-2 text-sm ${mode === "forecast" ? "bg-slate-900 text-white" : ""}`} onClick={() => setMode("forecast")}>Forecast</button>
        {mode === "statement" ? (
          <>
            <input type="date" className="rounded border px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" className="rounded border px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </>
        ) : null}
        <button className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>Print</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>Export CSV</button>
      </div>
      {error ? <div className="no-print rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      {mode === "statement" ? (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="print-card rounded border bg-white p-2 text-sm">Opening Cash: <b>{Number(statement?.opening_cash_balance ?? 0).toLocaleString()}</b></div>
            <div className="print-card rounded border bg-white p-2 text-sm">Inflow: <b>{Number(statement?.totals.inflow ?? 0).toLocaleString()}</b></div>
            <div className="print-card rounded border bg-white p-2 text-sm">Outflow: <b>{Number(statement?.totals.outflow ?? 0).toLocaleString()}</b></div>
            <div className="print-card rounded border bg-white p-2 text-sm">Closing Cash: <b>{Number(statement?.closing_cash_balance ?? 0).toLocaleString()}</b></div>
          </div>
          {(["operating", "investing", "financing"] as const).map((section) => (
            <div key={section} className="print-card rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold capitalize">
                {section} Activities
                <span className="ml-2 text-xs text-slate-500">
                  (Inflow {Number(statement?.sections[section].inflow ?? 0).toLocaleString()} | Outflow {Number(statement?.sections[section].outflow ?? 0).toLocaleString()} | Net {Number(statement?.sections[section].net ?? 0).toLocaleString()})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-2 py-1">Voucher</th>
                      <th className="px-2 py-1">Date</th>
                      <th className="px-2 py-1">Description</th>
                      <th className="px-2 py-1 text-right">Inflow</th>
                      <th className="px-2 py-1 text-right">Outflow</th>
                      <th className="px-2 py-1 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statement?.sections[section].rows ?? []).map((line) => (
                      <tr key={`${section}-${line.voucher_id}-${line.voucher_number}`} className="border-t">
                        <td className="px-2 py-1">{line.voucher_number}</td>
                        <td className="px-2 py-1">{line.voucher_date}</td>
                        <td className="px-2 py-1">{line.description ?? "-"}</td>
                        <td className="px-2 py-1 text-right">{Number(line.inflow).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{Number(line.outflow).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{Number(line.net).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((scenario) => (
            <div key={scenario.id} className="print-card rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 font-semibold">
                {scenario.name} <span className="text-xs text-slate-500">({scenario.status})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-2 py-1">Month</th>
                      <th className="px-2 py-1 text-right">Inflow</th>
                      <th className="px-2 py-1 text-right">Outflow</th>
                      <th className="px-2 py-1 text-right">Net</th>
                      <th className="px-2 py-1 text-right">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.lines.map((line) => (
                      <tr key={line.id} className="border-t">
                        <td className="px-2 py-1">{line.month_label}</td>
                        <td className="px-2 py-1 text-right">{Number(line.inflow).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{Number(line.outflow).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{Number(line.net).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{Number(line.cumulative).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
