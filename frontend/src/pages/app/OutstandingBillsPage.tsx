import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OutstandingBillCreate, type OutstandingBillResponse, type BillsAgingResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function OutstandingBillsPage() {
  const [rows, setRows] = useState<OutstandingBillResponse[]>([]);
  const [aging, setAging] = useState<BillsAgingResponse | null>(null);
  const [billType, setBillType] = useState<"PAYABLE" | "RECEIVABLE">("RECEIVABLE");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [settleMap, setSettleMap] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [voucherToolId, setVoucherToolId] = useState("");
  const [autoPartyName, setAutoPartyName] = useState("");
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
      logApiError("OutstandingBillsPage.load", e);
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
      logApiError("OutstandingBillsPage.settle", e);
      setError((e as Error).message);
    }
  }

  async function runAutoCreateBillRefs() {
    const vid = Number(voucherToolId);
    if (!Number.isFinite(vid) || vid <= 0) {
      setError("Enter a valid voucher ID for auto-create.");
      return;
    }
    try {
      setError("");
      const res = await api.autoCreateBillRefs(vid);
      setSuccess(`Created ${res.bills_created} bill reference(s): ${res.bill_numbers.join(", ") || "—"}`);
      await load();
    } catch (e) {
      logApiError("OutstandingBillsPage.autoCreateBillRefs", e);
      setError((e as Error).message);
    }
  }

  async function runAutoCreateBillFromVoucher() {
    const vid = Number(voucherToolId);
    if (!Number.isFinite(vid) || vid <= 0) {
      setError("Enter a valid voucher ID.");
      return;
    }
    if (!autoPartyName.trim()) {
      setError("Party name is required for outstanding bill auto-create.");
      return;
    }
    try {
      setError("");
      await api.autoCreateBillFromVoucher(vid, {
        party_name: autoPartyName.trim(),
        bill_type: billType,
        due_in_days: 30,
      });
      setSuccess("Outstanding bill created from voucher.");
      await load();
    } catch (e) {
      logApiError("OutstandingBillsPage.autoCreateBillFromVoucher", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Outstanding Bills</h1>
          <p className="text-sm text-text-muted">
            AP/AR bill tracking with aging buckets.{" "}
            <Link className="font-medium text-brand-primary hover:underline" to="/app/accounts/reports/ar-ap-aging">
              View full AR/AP aging report
            </Link>
            {" · "}
            <Link className="font-medium text-brand-primary hover:underline" to="/app/vouchers">
              Vouchers
            </Link>
          </p>
        </div>
        <select className="rounded border px-2 py-1 text-sm" value={billType} onChange={(e) => setBillType(e.target.value as "PAYABLE" | "RECEIVABLE")}>
          <option value="RECEIVABLE">Receivable</option>
          <option value="PAYABLE">Payable</option>
        </select>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">From voucher</h2>
        <p className="mt-1 text-xs text-text-muted">
          Create structured bill references (allocation tracking) or a simple outstanding bill row from a posted voucher.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-text-muted">Voucher ID</label>
            <input
              className="w-32 rounded border px-2 py-1 text-sm"
              value={voucherToolId}
              onChange={(e) => setVoucherToolId(e.target.value)}
              placeholder="e.g. 42"
            />
          </div>
          <div className="min-w-[12rem]">
            <label className="block text-xs text-text-muted">Party name (for outstanding bill)</label>
            <input
              className="w-full rounded border px-2 py-1 text-sm"
              value={autoPartyName}
              onChange={(e) => setAutoPartyName(e.target.value)}
              placeholder="Matches customer/vendor name"
            />
          </div>
          <button type="button" className="rounded border border-border-strong px-3 py-1.5 text-sm" onClick={() => void runAutoCreateBillRefs()}>
            Auto-create bill references
          </button>
          <button type="button" className="rounded bg-brand-primary px-3 py-1.5 text-sm text-brand-primary-foreground" onClick={() => void runAutoCreateBillFromVoucher()}>
            Auto-create outstanding bill
          </button>
        </div>
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
          <div className="rounded border bg-surface-raised p-2 text-sm">Current: <b>{(aging.buckets.current ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-surface-raised p-2 text-sm">1-30: <b>{(aging.buckets["1_30"] ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-surface-raised p-2 text-sm">31-60: <b>{(aging.buckets["31_60"] ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-surface-raised p-2 text-sm">61-90: <b>{(aging.buckets["61_90"] ?? 0).toLocaleString()}</b></div>
          <div className="rounded border bg-surface-raised p-2 text-sm">90+: <b>{(aging.buckets["90_plus"] ?? 0).toLocaleString()}</b></div>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Bill No (optional)" value={form.bill_no} onChange={(e) => setForm((p) => ({ ...p, bill_no: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Party Name" value={form.party_name} onChange={(e) => setForm((p) => ({ ...p, party_name: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.bill_date} onChange={(e) => setForm((p) => ({ ...p, bill_date: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Paid Amount" value={form.paid_amount} onChange={(e) => setForm((p) => ({ ...p, paid_amount: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Currency" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
        <button
          type="submit"
          className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
        >
          Create Bill
        </button>
      </form>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
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
                <td className="px-2 py-2 text-text-muted" colSpan={7}>
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
