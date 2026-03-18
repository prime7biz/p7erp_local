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
        <h1 className="text-2xl font-semibold text-text-primary">Payment Advice</h1>
        <p className="text-sm text-text-muted">Print-style payment batch advice with bank and voucher reference.</p>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <form onSubmit={load} className="flex gap-2 rounded-xl border border-border bg-surface-raised p-4">
        <input className="w-56 rounded border px-3 py-2 text-sm" placeholder="Payment run ID" value={runId} onChange={(e) => setRunId(e.target.value)} />
        <button className="rounded bg-brand-primary px-4 py-2 text-sm text-brand-primary-foreground">Load Advice</button>
        {data ? (
          <button type="button" className="rounded border px-4 py-2 text-sm" onClick={() => window.print()}>
            Print
          </button>
        ) : null}
      </form>

      {data ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
          <div className="grid gap-2 md:grid-cols-4">
            <p><span className="text-text-muted">Run:</span> {data.header.run_code}</p>
            <p><span className="text-text-muted">Date:</span> {data.header.run_date}</p>
            <p><span className="text-text-muted">Bank:</span> {data.header.bank_name ?? "-"}</p>
            <p><span className="text-text-muted">Voucher:</span> {data.header.executed_voucher_id ? `#${data.header.executed_voucher_id}` : "-"}</p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
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
          <p className="text-sm font-medium text-text-secondary">
            Total: {data.totals.total_amount.toLocaleString()} ({data.totals.item_count} items)
          </p>
        </div>
      ) : null}
    </div>
  );
}
