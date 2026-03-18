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
        <h1 className="text-2xl font-semibold text-text-primary">Voucher Print / Report</h1>
        <p className="text-sm text-text-muted">Load voucher details in print-friendly report format.</p>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <form onSubmit={load} className="flex gap-2 rounded-xl border border-border bg-surface-raised p-4">
        <input
          className="w-56 rounded border px-3 py-2 text-sm"
          placeholder="Voucher ID"
          value={voucherId}
          onChange={(e) => setVoucherId(e.target.value)}
        />
        <button className="rounded bg-surface-inverse px-4 py-2 text-sm text-text-inverse">Load</button>
      </form>

      {data ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="mb-3 grid gap-2 md:grid-cols-4">
            <p><span className="text-text-muted">No:</span> {data.voucher.voucher_number}</p>
            <p><span className="text-text-muted">Type:</span> {data.voucher.voucher_type}</p>
            <p><span className="text-text-muted">Date:</span> {data.voucher.voucher_date}</p>
            <p><span className="text-text-muted">Status:</span> {data.voucher.status}</p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
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
            <p className={data.totals.is_balanced ? "text-status-success-foreground" : "text-status-danger-foreground"}>
              {data.totals.is_balanced ? "Balanced" : "Not Balanced"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
