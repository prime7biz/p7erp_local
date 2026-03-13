import { useEffect, useState } from "react";
import { api, type AccountGroupResponse, type FinancialStatementsResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function FinancialStatementsPage() {
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

  function exportCsv() {
    const rows = [
      ["section", "metric", "value"],
      ["profit_and_loss", "income", String(Number(data?.profit_and_loss.income ?? 0))],
      ["profit_and_loss", "expense", String(Number(data?.profit_and_loss.expense ?? 0))],
      ["profit_and_loss", "net_profit", String(Number(data?.profit_and_loss.net_profit ?? 0))],
      ["balance_sheet", "assets", String(Number(data?.balance_sheet.assets ?? 0))],
      ["balance_sheet", "liabilities", String(Number(data?.balance_sheet.liabilities ?? 0))],
      ["balance_sheet", "equity", String(Number(data?.balance_sheet.equity ?? 0))],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadCsv(csv, "financial_statements_report");
    setSuccess("Financial Statements exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Financial Statements print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Financial Statements</h1>
        <p className="text-xs text-slate-600">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
        <h1 className="text-2xl font-semibold text-slate-900">Financial Statements</h1>
        <p className="text-sm text-slate-500">Profit & loss and balance sheet summary.</p>
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

      <div className={`grid ${compactView ? "gap-2" : "gap-4"} md:grid-cols-2`}>
        <div className={`print-card rounded-xl border border-slate-200 bg-white ${compactView ? "p-2" : "p-4"} print:p-2`}>
          <h2 className={`mb-3 ${compactView ? "text-base" : "text-lg"} font-semibold`}>Profit & Loss</h2>
          <div className={`space-y-2 ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
            <div className="flex justify-between">
              <span>Income</span>
              <span className="font-medium">{Number(data?.profit_and_loss.income ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Expense</span>
              <span className="font-medium">{Number(data?.profit_and_loss.expense ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Net Profit</span>
              <span className="font-semibold">{Number(data?.profit_and_loss.net_profit ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className={`print-card rounded-xl border border-slate-200 bg-white ${compactView ? "p-2" : "p-4"} print:p-2`}>
          <h2 className={`mb-3 ${compactView ? "text-base" : "text-lg"} font-semibold`}>Balance Sheet</h2>
          <div className={`space-y-2 ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
            <div className="flex justify-between">
              <span>Assets</span>
              <span className="font-medium">{Number(data?.balance_sheet.assets ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Liabilities</span>
              <span className="font-medium">{Number(data?.balance_sheet.liabilities ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Equity</span>
              <span className="font-semibold">{Number(data?.balance_sheet.equity ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
