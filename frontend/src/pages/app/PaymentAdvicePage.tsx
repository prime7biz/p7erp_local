import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type PaymentRunAdviceResponse } from "@/api/client";

export function PaymentAdvicePage() {
  const [search] = useSearchParams();
  const [runId, setRunId] = useState(search.get("run_id") ?? "");
  const [data, setData] = useState<PaymentRunAdviceResponse | null>(null);
  const [error, setError] = useState("");

  async function load(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      const id = Number(runId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Enter valid run ID");
      setData(await api.getPaymentRunAdvice(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Payment Advice</h1>
        <p className="text-sm text-slate-500">Print-style payment batch advice with bank and voucher reference.</p>
      </div>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={load} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input className="w-56 rounded border px-3 py-2 text-sm" placeholder="Payment run ID" value={runId} onChange={(e) => setRunId(e.target.value)} />
        <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Load Advice</button>
        {data ? (
          <button type="button" className="rounded border px-4 py-2 text-sm" onClick={() => window.print()}>
            Print
          </button>
        ) : null}
      </form>

      {data ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-2 md:grid-cols-4">
            <p><span className="text-slate-500">Run:</span> {data.header.run_code}</p>
            <p><span className="text-slate-500">Date:</span> {data.header.run_date}</p>
            <p><span className="text-slate-500">Bank:</span> {data.header.bank_name ?? "-"}</p>
            <p><span className="text-slate-500">Voucher:</span> {data.header.executed_voucher_id ? `#${data.header.executed_voucher_id}` : "-"}</p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-2 py-1">Party</th>
                <th className="px-2 py-1">Reference</th>
                <th className="px-2 py-1 text-right">Amount</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.item_id} className="border-t">
                  <td className="px-2 py-1">{item.party_name}</td>
                  <td className="px-2 py-1">{item.reference ?? "-"}</td>
                  <td className="px-2 py-1 text-right">{item.amount.toLocaleString()}</td>
                  <td className="px-2 py-1">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm font-medium text-slate-700">
            Total: {data.totals.total_amount.toLocaleString()} ({data.totals.item_count} items)
          </p>
        </div>
      ) : null}
    </div>
  );
}
