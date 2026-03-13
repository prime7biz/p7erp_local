import { useEffect, useState } from "react";
import { api, type AccountGroupResponse, type ChartOfAccountResponse, type DayBookResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function DayBookPage() {
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherType, setVoucherType] = useState("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [partyName, setPartyName] = useState("");
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [data, setData] = useState<DayBookResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      setData(
        await api.getDayBook({
          from_date: fromDate,
          to_date: toDate,
          voucher_type: voucherType || undefined,
          group_id: groupId || undefined,
          account_id: accountId || undefined,
          party_name: partyName.trim() || undefined,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadMeta() {
    try {
      const [types, accountGroups, chartAccounts] = await Promise.all([
        api.getVoucherTypesMeta(),
        api.listAccountGroups(),
        api.listChartOfAccounts({ active_only: true }),
      ]);
      setVoucherTypes(types);
      setGroups(accountGroups);
      setAccounts(chartAccounts);
    } catch {
      // Keep day book usable even if metadata call fails.
      setVoucherTypes([]);
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
  }, [fromDate, toDate, voucherType, groupId, accountId, partyName]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function exportCsv() {
    const headers = ["voucher_number", "voucher_date", "voucher_type", "status", "description", "amount"];
    const lines = (data?.rows ?? []).map((r) =>
      [r.voucher_number, r.voucher_date, r.voucher_type, r.status, (r.description ?? "").replaceAll(",", " "), String(r.amount)].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "day_book_report");
    setSuccess("Day Book exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Day Book print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Day Book</h1>
        <p className="text-xs text-slate-600">
          Period: {fromDate} to {toDate}
        </p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold text-slate-900">Day Book</h1>
          <p className="text-sm text-slate-500">Voucher transaction register with date range filtering.</p>
        </div>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <select className="rounded border px-3 py-2 text-sm" value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
          <option value="">All Types</option>
          {voucherTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Party/Ref contains..."
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
        />
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
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Voucher</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Date</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Type</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Status</th>
              <th className={compactView ? "px-2 py-1" : "px-3 py-2"}>Description</th>
              <th className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.voucher_number}</td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.voucher_date}</td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.voucher_type}</td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.status}</td>
                <td className={compactView ? "px-2 py-1" : "px-3 py-2"}>{r.description ?? "-"}</td>
                <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{r.amount.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t bg-slate-50 font-semibold">
              <td className={compactView ? "px-2 py-1" : "px-3 py-2"} colSpan={5}>
                Total
              </td>
              <td className={`${compactView ? "px-2 py-1" : "px-3 py-2"} text-right`}>{Number(data?.total_amount ?? 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
