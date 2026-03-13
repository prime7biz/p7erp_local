import { useEffect, useMemo, useState } from "react";
import { api, type AccountGroupResponse, type ChartOfAccountResponse, type TrialBalanceResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function GroupSummaryPage() {
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

  const summary = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const r of data?.rows ?? []) {
      const prev = map.get(r.group_name) ?? { debit: 0, credit: 0 };
      prev.debit += r.debit;
      prev.credit += r.credit;
      map.set(r.group_name, prev);
    }
    return Array.from(map.entries()).map(([group_name, v]) => ({ group_name, ...v }));
  }, [data]);

  function exportCsv() {
    const headers = ["group_name", "debit", "credit", "net"];
    const lines = summary.map((r) => [r.group_name.replaceAll(",", " "), String(r.debit), String(r.credit), String(r.debit - r.credit)].join(","));
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "group_summary_report");
    setSuccess("Group Summary exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Group Summary print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Group Summary</h1>
        <p className="text-xs text-slate-600">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
        <h1 className="text-2xl font-semibold text-slate-900">Group Summary</h1>
        <p className="text-sm text-slate-500">Account group wise debit/credit totals.</p>
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
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Group</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Debit</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Credit</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Net</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.group_name} className="border-t">
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.group_name}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.debit.toLocaleString()}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.credit.toLocaleString()}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{(r.debit - r.credit).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
