import { FormEvent, useState } from "react";
import { api, type VoucherPrintResponse } from "@/api/client";

export function VoucherPrintPage() {
  const [voucherId, setVoucherId] = useState("");
  const [data, setData] = useState<VoucherPrintResponse | null>(null);
  const [error, setError] = useState("");

  async function load(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      const id = Number(voucherId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Enter a valid voucher ID");
      setData(await api.getVoucherPrint(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Voucher Print / Report</h1>
        <p className="text-sm text-slate-500">Load voucher details in print-friendly report format.</p>
      </div>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={load} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          className="w-56 rounded border px-3 py-2 text-sm"
          placeholder="Voucher ID"
          value={voucherId}
          onChange={(e) => setVoucherId(e.target.value)}
        />
        <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Load</button>
      </form>

      {data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 grid gap-2 md:grid-cols-4">
            <p><span className="text-slate-500">No:</span> {data.voucher.voucher_number}</p>
            <p><span className="text-slate-500">Type:</span> {data.voucher.voucher_type}</p>
            <p><span className="text-slate-500">Date:</span> {data.voucher.voucher_date}</p>
            <p><span className="text-slate-500">Status:</span> {data.voucher.status}</p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-2 py-1">Account</th>
                <th className="px-2 py-1">Entry</th>
                <th className="px-2 py-1 text-right">Amount</th>
                <th className="px-2 py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.line_id} className="border-t">
                  <td className="px-2 py-1">{line.account_name}</td>
                  <td className="px-2 py-1">{line.entry_type}</td>
                  <td className="px-2 py-1 text-right">{line.amount.toLocaleString()}</td>
                  <td className="px-2 py-1">{line.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <p>Debit Total: {data.totals.debit_total.toLocaleString()}</p>
            <p>Credit Total: {data.totals.credit_total.toLocaleString()}</p>
            <p className={data.totals.is_balanced ? "text-emerald-600" : "text-rose-600"}>
              {data.totals.is_balanced ? "Balanced" : "Not Balanced"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
