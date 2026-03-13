import { FormEvent, useEffect, useState } from "react";
import { api, type BankAccountCreate, type BankAccountResponse, type ChartOfAccountResponse } from "@/api/client";

export function BankAccountsPage() {
  const [rows, setRows] = useState<BankAccountResponse[]>([]);
  const [ledgers, setLedgers] = useState<ChartOfAccountResponse[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<BankAccountCreate>({
    account_name: "",
    bank_name: "",
    account_number: "",
    branch_name: "",
    swift_code: "",
    routing_number: "",
    currency: "BDT",
    gl_account_id: undefined,
    opening_balance: "0",
    current_balance: "0",
    is_active: true,
  });

  async function load() {
    try {
      setError("");
      const [accounts, coa] = await Promise.all([api.listBankAccounts({ active_only: false }), api.listChartOfAccounts()]);
      setRows(accounts);
      setLedgers(coa);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!form.account_name?.trim()) throw new Error("Account name is required");
      if (!form.bank_name?.trim()) throw new Error("Bank name is required");
      if (!form.account_number?.trim()) throw new Error("Account number is required");
      if (editingId) await api.updateBankAccount(editingId, form);
      else await api.createBankAccount(form);
      setEditingId(null);
      setForm({
        account_name: "",
        bank_name: "",
        account_number: "",
        branch_name: "",
        swift_code: "",
        routing_number: "",
        currency: "BDT",
        gl_account_id: undefined,
        opening_balance: "0",
        current_balance: "0",
        is_active: true,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(row: BankAccountResponse) {
    setEditingId(row.id);
    setForm({
      account_name: row.account_name,
      bank_name: row.bank_name,
      account_number: row.account_number,
      branch_name: row.branch_name ?? "",
      swift_code: row.swift_code ?? "",
      routing_number: row.routing_number ?? "",
      currency: row.currency,
      gl_account_id: row.gl_account_id ?? undefined,
      opening_balance: row.opening_balance,
      current_balance: row.current_balance,
      is_active: row.is_active,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bank Accounts</h1>
        <p className="text-sm text-slate-500">Maintain bank master, linked ledger, and working balance.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Account Name" value={form.account_name} onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Bank Name" value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Account Number" value={form.account_number} onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))} />
        <select className="rounded border px-3 py-2 text-sm" value={form.gl_account_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, gl_account_id: e.target.value ? Number(e.target.value) : undefined }))}>
          <option value="">Linked GL Account (optional)</option>
          {ledgers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.account_number} - {l.name}
            </option>
          ))}
        </select>
        <input className="rounded border px-3 py-2 text-sm" placeholder="Currency (e.g. BDT)" value={form.currency ?? "BDT"} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Opening Balance" value={form.opening_balance ?? "0"} onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Current Balance" value={form.current_balance ?? "0"} onChange={(e) => setForm((p) => ({ ...p, current_balance: e.target.value }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">{editingId ? "Update" : "Create"}</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Account</th>
              <th className="px-2 py-1">Bank</th>
              <th className="px-2 py-1">Number</th>
              <th className="px-2 py-1">Currency</th>
              <th className="px-2 py-1 text-right">Current</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.account_name}</td>
                <td className="px-2 py-1">{r.bank_name}</td>
                <td className="px-2 py-1">{r.account_number}</td>
                <td className="px-2 py-1">{r.currency}</td>
                <td className="px-2 py-1 text-right">{Number(r.current_balance).toLocaleString()}</td>
                <td className="px-2 py-1">{r.is_active ? "ACTIVE" : "INACTIVE"}</td>
                <td className="px-2 py-1">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(r)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
