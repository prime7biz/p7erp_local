import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type AccountGroupCreate, type AccountGroupResponse } from "@/api/client";

const NATURES = ["Asset", "Liability", "Income", "Expense", "Equity"];

export function AccountGroupsPage() {
  const [rows, setRows] = useState<AccountGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountGroupCreate>({
    name: "",
    code: "",
    parent_group_id: null,
    nature: "Asset",
    affects_gross_profit: false,
    is_bank_group: false,
    sort_order: 0,
    is_active: true,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.listAccountGroups());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const parentOptions = useMemo(
    () => rows.filter((r) => r.id !== editingId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [rows, editingId],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!form.name.trim() || !form.code.trim()) throw new Error("Name and code are required");
      if (editingId) {
        await api.updateAccountGroup(editingId, form);
      } else {
        await api.createAccountGroup(form);
      }
      setEditingId(null);
      setForm({
        name: "",
        code: "",
        parent_group_id: null,
        nature: "Asset",
        affects_gross_profit: false,
        is_bank_group: false,
        sort_order: 0,
        is_active: true,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(row: AccountGroupResponse) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      code: row.code,
      parent_group_id: row.parent_group_id,
      nature: row.nature,
      affects_gross_profit: row.affects_gross_profit,
      is_bank_group: row.is_bank_group,
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this account group?")) return;
    try {
      await api.deleteAccountGroup(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Account Groups</h1>
        <p className="mt-1 text-sm text-slate-500">Finance module parity: group hierarchy, nature, and control flags.</p>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Group Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={form.nature}
          onChange={(e) => setForm((p) => ({ ...p, nature: e.target.value }))}
        >
          {NATURES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-3 py-2 text-sm"
          value={form.parent_group_id ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, parent_group_id: e.target.value ? Number(e.target.value) : null }))}
        >
          <option value="">No Parent</option>
          {parentOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.affects_gross_profit}
            onChange={(e) => setForm((p) => ({ ...p, affects_gross_profit: e.target.checked }))}
          />
          Affects GP
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.is_bank_group}
            onChange={(e) => setForm((p) => ({ ...p, is_bank_group: e.target.checked }))}
          />
          Bank Group
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
          Active
        </label>
        <div className="flex justify-end gap-2 md:col-span-1">
          {editingId ? (
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => {
                setEditingId(null);
                setForm({
                  name: "",
                  code: "",
                  parent_group_id: null,
                  nature: "Asset",
                  affects_gross_profit: false,
                  is_bank_group: false,
                  sort_order: 0,
                  is_active: true,
                });
              }}
            >
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
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Nature</th>
              <th className="px-4 py-3">Parent</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  Loading account groups...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No account groups yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.code}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{r.nature}</td>
                  <td className="px-4 py-3">{rows.find((x) => x.id === r.parent_group_id)?.name || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.affects_gross_profit ? "GP " : ""}
                    {r.is_bank_group ? "BANK " : ""}
                    {r.is_active ? "ACTIVE" : "INACTIVE"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
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
