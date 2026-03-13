import { FormEvent, useEffect, useState } from "react";
import { api, type OutstandingBillCreate, type OutstandingBillResponse, type BillsAgingResponse } from "@/api/client";

export function OutstandingBillsPage() {
  const [rows, setRows] = useState<OutstandingBillResponse[]>([]);
  const [aging, setAging] = useState<BillsAgingResponse | null>(null);
  const [billType, setBillType] = useState<"PAYABLE" | "RECEIVABLE">("RECEIVABLE");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [settleMap, setSettleMap] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<OutstandingBillCreate>({
    bill_no: "",
    party_name: "",
    bill_type: "RECEIVABLE",
    bill_date: new Date().toISOString().slice(0, 10),
    due_date: new Date().toISOString().slice(0, 10),
    amount: "0",
    paid_amount: "0",
    currency: "BDT",
    notes: "",
  });

  async function load() {
    try {
      setSuccess("");
      setError("");
      const [bills, ag] = await Promise.all([
        api.listOutstandingBills({ bill_type: billType, status_filter: statusFilter || undefined }),
        api.getBillsAging({ bill_type: billType }),
      ]);
      setRows(bills);
      setAging(ag);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billType, statusFilter]);

  const filteredRows = rows.filter((r) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return r.bill_no.toLowerCase().includes(query) || r.party_name.toLowerCase().includes(query);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      setSuccess("");
      if (!form.party_name.trim()) throw new Error("Party name is required");
      if (!form.bill_date || !form.due_date) throw new Error("Bill date and due date are required");
      if (Number(form.amount) <= 0) throw new Error("Amount must be greater than zero");
      await api.createOutstandingBill(form);
      setForm((p) => ({ ...p, bill_no: "", party_name: "", amount: "0", notes: "" }));
      setSuccess("Bill created successfully.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function settle(id: number) {
    try {
      const amount = settleMap[id] || "0";
      if (Number(amount) <= 0) throw new Error("Settle amount must be greater than zero");
      await api.settleOutstandingBill(id, amount);
      setSuccess("Bill settlement applied.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Outstanding Bills</h1>
          <p className="text-sm text-slate-500">AP/AR bill tracking with aging buckets.</p>
        </div>
        <select className="rounded border px-2 py-1 text-sm" value={billType} onChange={(e) => setBillType(e.target.value as "PAYABLE" | "RECEIVABLE")}>
          <option value="RECEIVABLE">Receivable</option>
          <option value="PAYABLE">Payable</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="OPEN">OPEN</option>
          <option value="PARTIAL">PARTIAL</option>
          <option value="PAID">PAID</option>
        </select>
        <input
          className="w-full rounded border px-3 py-2 text-sm md:w-80"
          placeholder="Search bill no or party..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {aging ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded border bg-white p-2 text-sm">Current: <b>{(aging.buckets.current ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-white p-2 text-sm">1-30: <b>{(aging.buckets["1_30"] ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-white p-2 text-sm">31-60: <b>{(aging.buckets["31_60"] ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-white p-2 text-sm">61-90: <b>{(aging.buckets["61_90"] ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-white p-2 text-sm">90+: <b>{(aging.buckets["90_plus"] ?? 0).toLocaleString()}</b></div>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Bill No (optional)" value={form.bill_no} onChange={(e) => setForm((p) => ({ ...p, bill_no: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Party Name" value={form.party_name} onChange={(e) => setForm((p) => ({ ...p, party_name: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.bill_date} onChange={(e) => setForm((p) => ({ ...p, bill_date: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Paid Amount" value={form.paid_amount} onChange={(e) => setForm((p) => ({ ...p, paid_amount: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Currency" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Create Bill</button>
      </form>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Bill</th>
              <th className="px-2 py-1">Party</th>
              <th className="px-2 py-1">Due</th>
              <th className="px-2 py-1">Amount</th>
              <th className="px-2 py-1">Paid</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Settle</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.bill_no}</td>
                <td className="px-2 py-1">{r.party_name}</td>
                <td className="px-2 py-1">{r.due_date}</td>
                <td className="px-2 py-1">{Number(r.amount).toLocaleString()}</td>
                <td className="px-2 py-1">{Number(r.paid_amount).toLocaleString()}</td>
                <td className="px-2 py-1">{r.status}</td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    <input className="w-24 rounded border px-2 py-1 text-xs" value={settleMap[r.id] ?? ""} onChange={(e) => setSettleMap((p) => ({ ...p, [r.id]: e.target.value }))} />
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void settle(r.id)}>
                      Settle
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr className="border-t">
                <td className="px-2 py-2 text-slate-500" colSpan={7}>
                  No bills found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
