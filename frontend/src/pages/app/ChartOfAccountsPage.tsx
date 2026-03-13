import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type ChartOfAccountCreate, type ChartOfAccountResponse, type AccountGroupResponse } from "@/api/client";

export function ChartOfAccountsPage() {
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [rows, setRows] = useState<ChartOfAccountResponse[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ChartOfAccountCreate>({
    account_number: "",
    name: "",
    group_id: 0,
    normal_balance: "debit",
    opening_balance: "0",
    description: "",
    is_active: true,
    is_bank_account: false,
  });

  async function load() {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([api.listAccountGroups(), api.listChartOfAccounts({ active_only: !showInactive })]);
      setGroups(g);
      setRows(a);
      if (!form.group_id && g.length > 0) {
        const firstGroup = g[0];
        if (firstGroup) {
          setForm((p) => ({ ...p, group_id: firstGroup.id }));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!form.name?.trim()) throw new Error("Ledger name is required");
      if (!form.group_id) throw new Error("Please select a group");
      if (editingId) {
        await api.updateChartOfAccount(editingId, form);
      } else {
        await api.createChartOfAccount(form);
      }
      setEditingId(null);
      setForm((p) => ({ ...p, account_number: "", name: "", opening_balance: "0", description: "" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(row: ChartOfAccountResponse) {
    setEditingId(row.id);
    setForm({
      account_number: row.account_number,
      name: row.name,
      group_id: row.group_id,
      normal_balance: row.normal_balance,
      opening_balance: row.opening_balance,
      description: row.description,
      is_active: row.is_active,
      is_bank_account: row.is_bank_account,
    });
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this ledger account?")) return;
    try {
      await api.deleteChartOfAccount(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Chart of Accounts</h1>
          <p className="mt-1 text-sm text-slate-500">Ledger accounts, opening balances, and group-based classification.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show Inactive
        </label>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Account Number (optional)"
          value={form.account_number}
          onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))}
        />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Ledger Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={form.group_id}
          onChange={(e) => setForm((p) => ({ ...p, group_id: Number(e.target.value) }))}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Opening Balance"
          value={form.opening_balance}
          onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={form.normal_balance}
          onChange={(e) => setForm((p) => ({ ...p, normal_balance: e.target.value as "debit" | "credit" }))}
        >
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        <input
          className="rounded border px-3 py-2 text-sm sm:col-span-2"
          placeholder="Description"
          value={form.description ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />
        <div className="flex items-center justify-between rounded border px-3 py-2 sm:col-span-2 lg:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_bank_account}
              onChange={(e) => setForm((p) => ({ ...p, is_bank_account: e.target.checked }))}
            />
            Bank Account
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-1">
          {editingId ? (
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setEditingId(null)}>
              Cancel
            </button>
          ) : null}
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">{editingId ? "Update" : "Create"}</button>
        </div>
      </form>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Normal</th>
              <th className="px-4 py-3">Opening</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  Loading chart of accounts...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  No ledger accounts found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.account_number}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{groupMap.get(r.group_id) || "-"}</td>
                  <td className="px-4 py-3 uppercase">{r.normal_balance}</td>
                  <td className="px-4 py-3">{Number(r.opening_balance || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">{Number(r.balance || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(r)}>
                        Edit
                      </button>
                      <button className="rounded border px-2 py-1 text-xs text-rose-600" onClick={() => void remove(r.id)}>
                        Delete
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
  );
}
