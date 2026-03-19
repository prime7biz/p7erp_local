import { useEffect, useState } from "react";
import { api, type ChartOfAccountResponse, type LedgerActivityResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function LedgerActivityPage() {
  const [compactView, setCompactView] = useState(false);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<LedgerActivityResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadAccounts() {
    try {
      const rows = await api.listChartOfAccounts();
      setAccounts(rows);
      if (!selectedAccountId && rows.length > 0) {
        const firstAccount = rows[0];
        if (firstAccount) setSelectedAccountId(firstAccount.id);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadReport() {
    try {
      if (!selectedAccountId) return;
      setError("");
      setData(await api.getLedgerActivity({ account_id: selectedAccountId, from_date: fromDate, to_date: toDate }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedAccountId) void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, fromDate, toDate]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function exportCsv() {
    const headers = ["voucher_date", "voucher_number", "entry_type", "amount", "reference", "description", "running_balance"];
    const lines = (data?.rows ?? []).map((r) =>
      [r.voucher_date, r.voucher_number, r.entry_type, String(r.amount), (r.reference ?? "").replaceAll(",", " "), (r.description ?? "").replaceAll(",", " "), String(r.running_balance)].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "ledger_activity_report");
    setSuccess("Ledger Activity exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Ledger Activity print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border-strong pb-2">
        <h1 className="text-lg font-semibold">Ledger Activity Report</h1>
        <p className="text-xs text-text-secondary">
          Period: {fromDate} to {toDate}
        </p>
      </div>
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-text-primary">Ledger Activity Report</h1>
        <p className="text-sm text-text-muted">Account-wise posted voucher activity with running balance.</p>
      </div>
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      <div className="no-print grid gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:grid-cols-2 lg:grid-cols-5">
        <select className="rounded border px-3 py-2 text-sm sm:col-span-2 lg:col-span-2" value={selectedAccountId ?? ""} onChange={(e) => setSelectedAccountId(Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_number} - {a.name}
            </option>
          ))}
        </select>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void loadReport()}>
          Refresh
        </button>
      </div>

      {data ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className={`print-card rounded border border-border bg-surface-raised ${compactView ? "p-1 text-xs" : "p-2 text-sm"}`}>Opening: <b>{data.opening_balance.toLocaleString()}</b></div>
          <div className={`print-card rounded border border-border bg-surface-raised ${compactView ? "p-1 text-xs" : "p-2 text-sm"}`}>Closing: <b>{data.closing_balance.toLocaleString()}</b></div>
          <button
            type="button"
            className={`no-print rounded border px-3 py-2 text-sm ${compactView ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "border-border-strong bg-surface-raised text-text-secondary"}`}
            onClick={() => setCompactView((v) => !v)}
          >
            {compactView ? "Comfort View" : "Compact View"}
          </button>
          <button className="no-print rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm" onClick={() => handlePrint()}>Print</button>
          <button className="no-print rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm" onClick={() => exportCsv()}>Export CSV</button>
        </div>
      ) : null}

      <div className="print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className={`min-w-full ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className={compactView ? "px-1 py-1" : "px-2 py-1"}>Date</th>
              <th className={compactView ? "px-1 py-1" : "px-2 py-1"}>Voucher</th>
              <th className={compactView ? "px-1 py-1" : "px-2 py-1"}>Entry</th>
              <th className={`${compactView ? "px-1 py-1" : "px-2 py-1"} text-right`}>Amount</th>
              <th className={compactView ? "px-1 py-1" : "px-2 py-1"}>Reference</th>
              <th className={compactView ? "px-1 py-1" : "px-2 py-1"}>Description</th>
              <th className={`${compactView ? "px-1 py-1" : "px-2 py-1"} text-right`}>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={`${r.voucher_id}-${r.voucher_number}-${r.running_balance}`} className="border-t">
                <td className={compactView ? "px-1 py-1" : "px-2 py-1"}>{r.voucher_date}</td>
                <td className={compactView ? "px-1 py-1" : "px-2 py-1"}>{r.voucher_number}</td>
                <td className={compactView ? "px-1 py-1" : "px-2 py-1"}>{r.entry_type}</td>
                <td className={`${compactView ? "px-1 py-1" : "px-2 py-1"} text-right`}>{r.amount.toLocaleString()}</td>
                <td className={compactView ? "px-1 py-1" : "px-2 py-1"}>{r.reference ?? "-"}</td>
                <td className={compactView ? "px-1 py-1" : "px-2 py-1"}>{r.description ?? "-"}</td>
                <td className={`${compactView ? "px-1 py-1" : "px-2 py-1"} text-right`}>{r.running_balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
