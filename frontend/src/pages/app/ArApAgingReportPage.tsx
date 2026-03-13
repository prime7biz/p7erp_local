import { useEffect, useState } from "react";
import { api, type BillsAgingResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

export function ArApAgingReportPage() {
  const [billType, setBillType] = useState<"PAYABLE" | "RECEIVABLE">("RECEIVABLE");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyName, setPartyName] = useState("");
  const [data, setData] = useState<BillsAgingResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setError("");
      setData(await api.getBillsAging({ bill_type: billType, as_of_date: asOfDate, party_name: partyName.trim() || undefined }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billType, asOfDate, partyName]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function exportCsv() {
    const headers = ["bill_type", "bill_no", "party_name", "due_date", "outstanding_amount", "overdue_days", "bucket"];
    const lines = (data?.rows ?? []).map((r) =>
      [billType, r.bill_no, (r.party_name ?? "").replaceAll(",", " "), r.due_date, String(r.outstanding_amount), String(r.overdue_days), r.bucket].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, `ar_ap_aging_${billType.toLowerCase()}`);
    setSuccess("AR/AP Aging exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("AR/AP Aging print dialog opened.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">AR/AP Aging Report</h1>
        <p className="text-xs text-slate-600">
          Type: {billType} | As of: {asOfDate}
        </p>
      </div>
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-slate-900">AR/AP Aging Report</h1>
        <p className="text-sm text-slate-500">Dedicated aging analysis view for receivables and payables.</p>
      </div>
      {error ? <div className="no-print rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="no-print grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <select className="rounded border px-3 py-2 text-sm" value={billType} onChange={(e) => setBillType(e.target.value as "PAYABLE" | "RECEIVABLE")}>
          <option value="RECEIVABLE">Receivable</option>
          <option value="PAYABLE">Payable</option>
        </select>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Party contains..."
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
        />
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void load()}>
          Refresh
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>
          Print
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>
          Export CSV
        </button>
      </div>

      {data ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="print-card rounded border bg-white p-2 text-sm">Current: <b>{(data.buckets.current ?? 0).toLocaleString()}</b></div>
          <div className="print-card rounded border bg-white p-2 text-sm">1-30: <b>{(data.buckets["1_30"] ?? 0).toLocaleString()}</b></div>
          <div className="print-card rounded border bg-white p-2 text-sm">31-60: <b>{(data.buckets["31_60"] ?? 0).toLocaleString()}</b></div>
          <div className="print-card rounded border bg-white p-2 text-sm">61-90: <b>{(data.buckets["61_90"] ?? 0).toLocaleString()}</b></div>
          <div className="print-card rounded border bg-white p-2 text-sm">90+: <b>{(data.buckets["90_plus"] ?? 0).toLocaleString()}</b></div>
        </div>
      ) : null}

      <div className="print-card overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Bill</th>
              <th className="px-2 py-1">Party</th>
              <th className="px-2 py-1">Due Date</th>
              <th className="px-2 py-1 text-right">Outstanding</th>
              <th className="px-2 py-1 text-right">Overdue Days</th>
              <th className="px-2 py-1">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.bill_id} className="border-t">
                <td className="px-2 py-1">{r.bill_no}</td>
                <td className="px-2 py-1">{r.party_name}</td>
                <td className="px-2 py-1">{r.due_date}</td>
                <td className="px-2 py-1 text-right">{r.outstanding_amount.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{r.overdue_days}</td>
                <td className="px-2 py-1">{r.bucket}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
