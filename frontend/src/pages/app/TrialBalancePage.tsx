import { useEffect, useState } from "react";
import { api, type AccountGroupResponse, type ChartOfAccountResponse, type TrialBalanceResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [groupId, setGroupId] = useState<number | "">("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      setData(await api.getTrialBalance({ as_of_date: asOfDate, group_id: groupId || undefined, account_id: accountId || undefined }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadMeta() {
    try {
      const [accountGroups, chartAccounts] = await Promise.all([api.listAccountGroups(), api.listChartOfAccounts({ active_only: true })]);
      setGroups(accountGroups);
      setAccounts(chartAccounts);
    } catch {
      setGroups([]);
      setAccounts([]);
    }
  }

  useEffect(() => {
    void loadMeta();
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate, groupId, accountId]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function exportCsv() {
    const headers = ["account_number", "account_name", "group_name", "nature", "debit", "credit"];
    const lines = (data?.rows ?? []).map((r) =>
      [r.account_number, r.account_name.replaceAll(",", " "), r.group_name.replaceAll(",", " "), r.nature, String(r.debit), String(r.credit)].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "trial_balance_report");
    setSuccess("Trial Balance exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Trial Balance print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Trial Balance</h1>
        <p className="text-xs text-slate-600">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
        <h1 className="text-2xl font-semibold text-slate-900">Trial Balance</h1>
        <p className="text-sm text-slate-500">Ledger-wise debit and credit summary.</p>
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
        <select className="rounded border px-3 py-2 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_number} - {a.name}
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
      <div className="print-card overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className={`min-w-full ${compactView ? "text-xs" : "text-sm"} print:text-xs`}>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Account</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Group</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Nature</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Debit</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.account_id} className="border-t">
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>
                  {r.account_number} - {r.account_name}
                </td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.group_name}</td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.nature}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.debit.toLocaleString()}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.credit.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t bg-slate-50 font-semibold">
              <td className={compactView ? "px-2 py-1" : "px-3 py-2"} colSpan={3}>
                Total
              </td>
              <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{Number(data?.total_debit ?? 0).toLocaleString()}</td>
              <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{Number(data?.total_credit ?? 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
