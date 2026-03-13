import { useEffect, useState } from "react";
import {
  api,
  type VoucherReportMonthlyResponse,
  type VoucherReportSummaryResponse,
  type VoucherReportTopPreparersResponse,
} from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function VoucherAnalyticsPage() {
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherType, setVoucherType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [summary, setSummary] = useState<VoucherReportSummaryResponse | null>(null);
  const [monthly, setMonthly] = useState<VoucherReportMonthlyResponse | null>(null);
  const [topPreparers, setTopPreparers] = useState<VoucherReportTopPreparersResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      const [s, m, t] = await Promise.all([
        api.getVoucherReportSummary({
          from_date: fromDate,
          to_date: toDate,
          voucher_type: voucherType || undefined,
          status_filter: statusFilter || undefined,
        }),
        api.getVoucherReportMonthly(12, {
          from_date: fromDate,
          to_date: toDate,
          voucher_type: voucherType || undefined,
          status_filter: statusFilter || undefined,
        }),
        api.getVoucherReportTopPreparers(10, {
          from_date: fromDate,
          to_date: toDate,
          voucher_type: voucherType || undefined,
          status_filter: statusFilter || undefined,
        }),
      ]);
      setSummary(s);
      setMonthly(m);
      setTopPreparers(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, voucherType, statusFilter]);

  async function loadMeta() {
    try {
      const [types, sts] = await Promise.all([api.getVoucherTypesMeta(), api.getVoucherStatusesMeta()]);
      setVoucherTypes(types);
      setStatuses(sts);
    } catch {
      setVoucherTypes([]);
      setStatuses([]);
    }
  }

  useEffect(() => {
    void loadMeta();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function exportCsv() {
    const rows: string[] = ["section,key_1,key_2,value"];
    rows.push(`filters,from_date,,${fromDate}`);
    rows.push(`filters,to_date,,${toDate}`);
    rows.push(`filters,voucher_type,,${voucherType || "ALL"}`);
    rows.push(`filters,status,,${statusFilter || "ALL"}`);
    rows.push(`summary,total_vouchers,,${summary?.total_vouchers ?? 0}`);
    for (const [status, count] of Object.entries(summary?.status_counts ?? {})) {
      rows.push(`summary,status_count,${status},${count}`);
    }
    for (const m of monthly?.months ?? []) {
      rows.push(`monthly,${m.month},count,${m.count}`);
      rows.push(`monthly,${m.month},posted_count,${m.posted_count}`);
    }
    for (const r of topPreparers?.rows ?? []) {
      rows.push(`top_preparers,${r.username.replaceAll(",", " ")},count,${r.count}`);
    }
    downloadCsv(rows.join("\n"), "voucher_analytics_report");
    setSuccess("Voucher Analytics exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Voucher Analytics print dialog opened.");
  }

  function clearFilters() {
    setVoucherType("");
    setStatusFilter("");
    setFromDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
    setToDate(new Date().toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Voucher Analytics</h1>
        <p className="text-xs text-slate-600">
          Period: {fromDate} to {toDate}
        </p>
      </div>
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-slate-900">Voucher Analytics</h1>
        <p className="text-sm text-slate-500">Voucher summary, monthly trend and top preparers.</p>
      </div>
      {error ? <div className="no-print rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      <div className="no-print grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
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
        <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void load()}>
          Refresh
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={clearFilters}>
          Clear
        </button>
      </div>
      <div className="no-print flex flex-wrap gap-2">
        <button className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>Print</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>Export CSV</button>
      </div>

      <div className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Summary</h2>
        <p className="text-sm">Total vouchers: <b>{summary?.total_vouchers ?? 0}</b></p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary?.status_counts ?? {}).map(([status, count]) => (
            <div key={status} className="rounded border bg-slate-50 px-3 py-2 text-sm">
              {status}: <b>{count}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="print-card overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Monthly Trend</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Month</th>
              <th className="px-2 py-1 text-right">Count</th>
              <th className="px-2 py-1 text-right">Posted</th>
            </tr>
          </thead>
          <tbody>
            {(monthly?.months ?? []).map((m) => (
              <tr key={m.month} className="border-t">
                <td className="px-2 py-1">{m.month}</td>
                <td className="px-2 py-1 text-right">{m.count}</td>
                <td className="px-2 py-1 text-right">{m.posted_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="print-card overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Top Preparers</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">User</th>
              <th className="px-2 py-1 text-right">Vouchers</th>
            </tr>
          </thead>
          <tbody>
            {(topPreparers?.rows ?? []).map((r) => (
              <tr key={r.user_id} className="border-t">
                <td className="px-2 py-1">{r.username}</td>
                <td className="px-2 py-1 text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
