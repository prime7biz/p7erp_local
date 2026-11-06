import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AccountGroupResponse, type FinancialStatementsResponse, type ReportBasis } from "@/api/client";
import { trialBalanceHref, type AccountNature } from "@/lib/financeDrilldown";
import { downloadCsv, downloadXlsx, printCurrentPage } from "@/lib/reportExport";
import { todayLocalISO } from "@/lib/dates";

export function FinancialStatementsPage() {
  const [asOfDate, setAsOfDate] = useState(todayLocalISO());
  const [groupId, setGroupId] = useState<number | "">("");
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [basis, setBasis] = useState<ReportBasis>("fy");
  const [data, setData] = useState<FinancialStatementsResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      setData(await api.getFinancialStatements({ as_of_date: asOfDate, group_id: groupId || undefined, basis }));
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
  }, [asOfDate, groupId, basis]);

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

  async function exportExcel() {
    await downloadXlsx(
      ["Section", "Metric", "Value"],
      [
        ["Profit & Loss", "Income", Number(data?.profit_and_loss.income ?? 0)],
        ["Profit & Loss", "Expense", Number(data?.profit_and_loss.expense ?? 0)],
        ["Profit & Loss", "Net profit", Number(data?.profit_and_loss.net_profit ?? 0)],
        ["Balance Sheet", "Assets", Number(data?.balance_sheet.assets ?? 0)],
        ["Balance Sheet", "Liabilities", Number(data?.balance_sheet.liabilities ?? 0)],
        ["Balance Sheet", "Equity", Number(data?.balance_sheet.equity ?? 0)],
      ],
      "financial_statements_report",
    );
    setSuccess("Financial Statements exported to Excel.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Financial Statements print dialog opened.");
  }

  function natureLink(label: string, nature: AccountNature) {
    return (
      <Link
        className="text-brand-primary hover:underline print:text-inherit print:no-underline"
        to={trialBalanceHref({ asOf: asOfDate, nature, groupId, basis })}
        title={`Open ${label} accounts in Trial Balance`}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border pb-2">
        <h1 className="text-lg font-semibold">Financial Statements</h1>
        <p className="text-xs text-text-muted">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
        <h1 className="text-2xl font-semibold text-text-primary">Financial Statements</h1>
        <p className="text-sm text-text-muted">Profit & loss and balance sheet summary. Click a heading to see its accounts.</p>
        </div>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        <select className="rounded border px-3 py-2 text-sm" value={basis} onChange={(e) => setBasis(e.target.value as ReportBasis)} title="Income & expense period">
          <option value="fy">This financial year</option>
          <option value="cumulative">Since start (all years)</option>
        </select>
        <select className="rounded border px-3 py-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} - {g.name}
            </option>
          ))}
        </select>
        <button className={`rounded border px-3 py-2 text-sm ${compactView ? "bg-brand-primary text-brand-primary-foreground" : ""}`} onClick={() => setCompactView((v) => !v)}>
          {compactView ? "Comfort View" : "Compact View"}
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>Print</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>Export CSV</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void exportExcel().catch((e) => setError((e as Error).message))}>Export Excel</button>
      </div>

      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      <div className={`grid ${compactView ? "gap-2" : "gap-4"} md:grid-cols-2`}>
        <div className={`print-card rounded-xl border border-border bg-surface-raised ${compactView ? "p-2" : "p-4"} print:p-2`}>
          <h2 className={`mb-3 ${compactView ? "text-base" : "text-lg"} font-semibold`}>
            Profit & Loss
            {data?.fiscal_year && basis === "fy" ? (
              <span className="ml-2 text-xs font-normal text-text-muted">FY {data.fiscal_year.label}, from {data.fiscal_year.start_date}</span>
            ) : null}
          </h2>
          <div className={`space-y-2 ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
            <div className="flex justify-between">
              {natureLink("Income", "Income")}
              <span className="font-medium">{Number(data?.profit_and_loss.income ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              {natureLink("Expense", "Expense")}
              <span className="font-medium">{Number(data?.profit_and_loss.expense ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Net Profit</span>
              <span className="font-semibold">{Number(data?.profit_and_loss.net_profit ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className={`print-card rounded-xl border border-border bg-surface-raised ${compactView ? "p-2" : "p-4"} print:p-2`}>
          <h2 className={`mb-3 ${compactView ? "text-base" : "text-lg"} font-semibold`}>Balance Sheet</h2>
          <div className={`space-y-2 ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
            <div className="flex justify-between">
              {natureLink("Assets", "Asset")}
              <span className="font-medium">{Number(data?.balance_sheet.assets ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              {natureLink("Liabilities", "Liability")}
              <span className="font-medium">{Number(data?.balance_sheet.liabilities ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              {natureLink("Equity", "Equity")}
              <span className="font-semibold">{Number(data?.balance_sheet.equity ?? 0).toLocaleString()}</span>
            </div>
            {data?.profit_brought_forward != null ? (
              <>
                <div className="flex justify-between text-text-secondary">
                  <span>Profit brought forward (earlier years)</span>
                  <span className="font-medium">{Number(data.profit_brought_forward).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Profit this year</span>
                  <span className="font-medium">{Number(data.profit_and_loss.net_profit).toLocaleString()}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
