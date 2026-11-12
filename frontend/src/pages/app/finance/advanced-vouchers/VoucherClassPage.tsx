import { FormEvent, useEffect, useRef, useState } from "react";
import {
  api,
  type ChartOfAccountResponse,
  type CostCenterResponse,
  type VoucherClassLineTemplate,
  type VoucherClassResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { getChartOfAccountsCached, getCostCentersCached } from "@/lib/masterData";
import { useConfirm } from "@/components/app/useConfirm";

const EMPTY_LINE: VoucherClassLineTemplate = {
  account_id: 0,
  entry_type: "DEBIT",
  amount: "",
  notes: "",
};

const DEFAULT_FORM = {
  name: "",
  voucher_type: "JOURNAL",
  default_ledger_id: "",
  default_narration: "",
  default_cost_center_id: "",
  auto_tax: false,
  auto_round_off: false,
  auto_bill_allocation: false,
  is_active: true,
};

export function VoucherClassPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<VoucherClassResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterResponse[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [lines, setLines] = useState<VoucherClassLineTemplate[]>([{ ...EMPTY_LINE }]);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setError("");
      const [classesRes, coa, cc, types] = await Promise.all([
        api.listVoucherClasses(),
        getChartOfAccountsCached({ active_only: true }),
        getCostCentersCached({ active_only: true }),
        api.getVoucherTypesMeta(),
      ]);
      setRows(classesRes.rows);
      setAccounts(coa);
      setCostCenters(cc);
      setVoucherTypes(types.length ? types : ["JOURNAL", "PAYMENT", "RECEIPT", "CONTRA"]);
    } catch (e) {
      logApiError("VoucherClassPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(ev.target as Node)) {
        setOpenActionsId(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function resetForm() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setLines([{ ...EMPTY_LINE }]);
  }

  function startEdit(row: VoucherClassResponse) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      voucher_type: row.voucher_type,
      default_ledger_id: row.default_ledger_id ? String(row.default_ledger_id) : "",
      default_narration: row.default_narration ?? "",
      default_cost_center_id: row.default_cost_center_id ? String(row.default_cost_center_id) : "",
      auto_tax: row.auto_tax,
      auto_round_off: row.auto_round_off,
      auto_bill_allocation: row.auto_bill_allocation,
      is_active: row.is_active,
    });
    setLines(row.line_templates?.length ? [...row.line_templates] : [{ ...EMPTY_LINE }]);
    setOpenActionsId(null);
  }

  function buildBody() {
    const validLines = lines
      .filter((l) => l.account_id > 0 && String(l.amount).trim())
      .map((l) => ({
        account_id: l.account_id,
        entry_type: l.entry_type,
        amount: l.amount,
        notes: l.notes || null,
      }));
    return {
      name: form.name.trim(),
      voucher_type: form.voucher_type,
      default_ledger_id: form.default_ledger_id ? Number(form.default_ledger_id) : null,
      default_narration: form.default_narration || null,
      default_cost_center_id: form.default_cost_center_id ? Number(form.default_cost_center_id) : null,
      line_templates: validLines,
      auto_tax: form.auto_tax,
      auto_round_off: form.auto_round_off,
      auto_bill_allocation: form.auto_bill_allocation,
      is_active: form.is_active,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      const body = buildBody();
      if (editingId) {
        await api.updateVoucherClass(editingId, body);
      } else {
        await api.createVoucherClass(body);
      }
      resetForm();
      await load();
    } catch (err) {
      logApiError("VoucherClassPage.submit", err);
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    if (!(await confirm({ title: "Delete this voucher class?", danger: true }))) return;
    try {
      await api.deleteVoucherClass(id);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      logApiError("VoucherClassPage.delete", err);
      setError((err as Error).message);
    }
  }

  const acctName = new Map(accounts.map((a) => [a.id, `${a.account_number} — ${a.name}`]));

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Voucher Classes"
        description="Reusable templates with default ledger, narration, and line prefills."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-sm font-medium text-gray-900">{editingId ? "Edit class" : "New class"}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-600">
            Name
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-gray-600">
            Voucher type
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.voucher_type}
              onChange={(e) => setForm((p) => ({ ...p, voucher_type: e.target.value }))}
            >
              {voucherTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Default ledger
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.default_ledger_id}
              onChange={(e) => setForm((p) => ({ ...p, default_ledger_id: e.target.value }))}
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Default cost center
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.default_cost_center_id}
              onChange={(e) => setForm((p) => ({ ...p, default_cost_center_id: e.target.value }))}
            >
              <option value="">None</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.center_code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600 lg:col-span-2">
            Default narration
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.default_narration}
              onChange={(e) => setForm((p) => ({ ...p, default_narration: e.target.value }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-gray-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.auto_tax} onChange={(e) => setForm((p) => ({ ...p, auto_tax: e.target.checked }))} />
            Auto tax
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.auto_round_off}
              onChange={(e) => setForm((p) => ({ ...p, auto_round_off: e.target.checked }))}
            />
            Auto round-off
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.auto_bill_allocation}
              onChange={(e) => setForm((p) => ({ ...p, auto_bill_allocation: e.target.checked }))}
            />
            Auto bill allocation
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
            Active
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Line templates</p>
          {lines.map((ln, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-5">
              <select
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
                value={ln.account_id || ""}
                onChange={(e) => {
                  const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, account_id: Number(e.target.value) };
                  setLines(next);
                }}
              >
                <option value="">Account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_number} — {a.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={ln.entry_type}
                onChange={(e) => {
                  const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, entry_type: e.target.value as "DEBIT" | "CREDIT" };
                  setLines(next);
                }}
              >
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">CREDIT</option>
              </select>
              <input
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Amount"
                value={ln.amount}
                onChange={(e) => {
                  const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, amount: e.target.value };
                  setLines(next);
                }}
              />
              <div className="flex gap-1">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Notes"
                  value={ln.notes ?? ""}
                  onChange={(e) => {
                    const next = [...lines];
                    const cur = next[idx];
                    if (!cur) return;
                    next[idx] = { ...cur, notes: e.target.value };
                    setLines(next);
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-2 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
          >
            + Add line
          </button>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            {editingId ? "Update" : "Create"}
          </button>
          {editingId ? (
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Default ledger</th>
              <th className="px-3 py-2">Lines</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.voucher_type}</td>
                <td className="px-3 py-2 text-gray-600">
                  {r.default_ledger_id ? acctName.get(r.default_ledger_id) ?? `#${r.default_ledger_id}` : "—"}
                </td>
                <td className="px-3 py-2">{r.line_templates?.length ?? 0}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {[r.auto_tax && "Tax", r.auto_round_off && "Round", r.auto_bill_allocation && "Bill"].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-2">{r.is_active ? "Active" : "Inactive"}</td>
                <td className="relative px-3 py-2">
                  <div ref={openActionsId === r.id ? actionsRef : undefined} className="relative inline-block">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => startEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void remove(r.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No voucher classes yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
