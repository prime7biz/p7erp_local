import { useEffect, useState } from "react";
import { api, type AccountGroupResponse, type FinancialStatementsResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function RatioAnalysisPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [groupId, setGroupId] = useState<number | "">("");
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [data, setData] = useState<FinancialStatementsResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      setData(await api.getFinancialStatements({ as_of_date: asOfDate, group_id: groupId || undefined }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadGroups() {
    try {
      setGroups(await api.listAccountGroups());
    } catch {
      setGroups([]);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate, groupId]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const assets = Number(data?.balance_sheet.assets ?? 0);
  const liabilities = Number(data?.balance_sheet.liabilities ?? 0);
  const equity = Number(data?.balance_sheet.equity ?? 0);
  const netProfit = Number(data?.profit_and_loss.net_profit ?? 0);
  const income = Number(data?.profit_and_loss.income ?? 0);
  const debtToEquity = equity > 0 ? liabilities / equity : 0;
  const profitMargin = income > 0 ? (netProfit / income) * 100 : 0;
  const roe = equity > 0 ? (netProfit / equity) * 100 : 0;
  const roa = assets > 0 ? (netProfit / assets) * 100 : 0;

  function exportCsv() {
    const rows = [
      ["metric", "value"],
      ["Debt to Equity", debtToEquity.toFixed(2)],
      ["Profit Margin %", profitMargin.toFixed(2)],
      ["ROE %", roe.toFixed(2)],
      ["ROA %", roa.toFixed(2)],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadCsv(csv, "ratio_analysis_report");
    setSuccess("Ratio Analysis exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Ratio Analysis print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Ratio Analysis</h1>
        <p className="text-xs text-slate-600">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
        <h1 className="text-2xl font-semibold text-slate-900">Ratio Analysis</h1>
        <p className="text-sm text-slate-500">Financial health metrics based on current statements.</p>
        </div>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        <select className="rounded border px-3 py-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} - {g.name}
            </option>
          ))}
        </select>
        <button className={`rounded border px-3 py-2 text-sm ${compactView ? "bg-slate-900 text-white" : ""}`} onClick={() => setCompactView((v) => !v)}>
          {compactView ? "Comfort View" : "Compact View"}
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>Print</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>Export CSV</button>
      </div>
      {error ? <div className="no-print rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      <div className={`grid ${compactView ? "gap-2" : "gap-3"} md:grid-cols-4`}>
        <div className={`print-card rounded-xl border bg-white ${compactView ? "p-2" : "p-3"} print:p-2`}>
          <div className={`${compactView ? "text-[11px]" : "text-xs"} text-slate-500`}>Debt to Equity</div>
          <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{debtToEquity.toFixed(2)}</div>
        </div>
        <div className={`print-card rounded-xl border bg-white ${compactView ? "p-2" : "p-3"} print:p-2`}>
          <div className={`${compactView ? "text-[11px]" : "text-xs"} text-slate-500`}>Profit Margin %</div>
          <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{profitMargin.toFixed(2)}%</div>
        </div>
        <div className={`print-card rounded-xl border bg-white ${compactView ? "p-2" : "p-3"} print:p-2`}>
          <div className={`${compactView ? "text-[11px]" : "text-xs"} text-slate-500`}>ROE %</div>
          <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{roe.toFixed(2)}%</div>
        </div>
        <div className={`print-card rounded-xl border bg-white ${compactView ? "p-2" : "p-3"} print:p-2`}>
          <div className={`${compactView ? "text-[11px]" : "text-xs"} text-slate-500`}>ROA %</div>
          <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{roa.toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
}
