import { FormEvent, useEffect, useState } from "react";
import { api, type FxReceiptCreate, type FxReceiptResponse, type FxUnsettledSummaryResponse } from "@/api/client";

export function FxReceiptsPage() {
  const [rows, setRows] = useState<FxReceiptResponse[]>([]);
  const [summary, setSummary] = useState<FxUnsettledSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [settleMap, setSettleMap] = useState<Record<number, string>>({});
  const [form, setForm] = useState<FxReceiptCreate>({
    receipt_no: "",
    receipt_date: new Date().toISOString().slice(0, 10),
    source_ref: "",
    currency: "USD",
    fc_amount: "0",
    rate_to_base: "120",
    notes: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [fx, s] = await Promise.all([api.listFxReceipts(statusFilter ? { status_filter: statusFilter } : undefined), api.getFxUnsettledSummary()]);
      setRows(fx);
      setSummary(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createFxReceipt(form);
      setForm((p) => ({ ...p, receipt_no: "", source_ref: "", fc_amount: "0", notes: "" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function settle(id: number) {
    try {
      await api.settleFxReceipt(id, settleMap[id] || "0");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">FX Receipts & Settlement</h1>
        <p className="mt-1 text-sm text-slate-500">Track foreign currency receipts and settlement workflow.</p>
      </div>
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-500">Total Base</div>
            <div className="text-xl font-semibold">{summary.total_base_amount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-500">Total Settled</div>
            <div className="text-xl font-semibold text-emerald-600">{summary.total_settled_amount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-500">Unsettled</div>
            <div className="text-xl font-semibold text-amber-600">{summary.total_unsettled_amount.toLocaleString()}</div>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Receipt No (optional)" value={form.receipt_no} onChange={(e) => setForm((p) => ({ ...p, receipt_no: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.receipt_date} onChange={(e) => setForm((p) => ({ ...p, receipt_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Source Ref" value={form.source_ref} onChange={(e) => setForm((p) => ({ ...p, source_ref: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Currency" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="FC Amount" value={form.fc_amount} onChange={(e) => setForm((p) => ({ ...p, fc_amount: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Rate to Base" value={form.rate_to_base} onChange={(e) => setForm((p) => ({ ...p, rate_to_base: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm sm:col-span-2 lg:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white sm:col-span-2 lg:col-span-1">Create Receipt</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Receipt List</h2>
          <select className="rounded border px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="OPEN">OPEN</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="SETTLED">SETTLED</option>
          </select>
        </div>
        {error ? <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Receipt</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">FC Amount</th>
                <th className="px-3 py-2">Base Amount</th>
                <th className="px-3 py-2">Settled</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Settle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-5 text-slate-500" colSpan={7}>
                    Loading FX receipts...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 text-slate-500" colSpan={7}>
                    No FX receipts found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.receipt_no}</td>
                    <td className="px-3 py-2">{r.receipt_date}</td>
                    <td className="px-3 py-2">
                      {Number(r.fc_amount).toLocaleString()} {r.currency}
                    </td>
                    <td className="px-3 py-2">{Number(r.base_amount).toLocaleString()}</td>
                    <td className="px-3 py-2">{Number(r.settled_amount).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <input
                          className="w-24 rounded border px-2 py-1 text-xs"
                          placeholder="Amount"
                          value={settleMap[r.id] ?? ""}
                          onChange={(e) => setSettleMap((p) => ({ ...p, [r.id]: e.target.value }))}
                        />
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => void settle(r.id)}>
                          Settle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
