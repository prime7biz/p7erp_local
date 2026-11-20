import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type ChartOfAccountResponse,
  type CostCenterResponse,
  type VoucherClassLineTemplate,
  type VoucherClassResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection } from "@/components/finance/kit";
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

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

export function VoucherClassPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<VoucherClassResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterResponse[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [lines, setLines] = useState<VoucherClassLineTemplate[]>([{ ...EMPTY_LINE }]);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [search, setSearch] = useState("");

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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.voucher_type.toLowerCase().includes(q));
  }, [rows, search]);

  function resetForm() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setLines([{ ...EMPTY_LINE }]);
    setFormError(null);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    resetForm();
  }

  function openAdd() {
    resetForm();
    setDrawerOpen(true);
  }

  function startEdit(row: VoucherClassResponse) {
    setEditingId(row.id);
    setFormError(null);
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
    setDrawerOpen(true);
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
    setFormError(null);
    setSaving(true);
    try {
      const body = buildBody();
      if (editingId) {
        await api.updateVoucherClass(editingId, body);
      } else {
        await api.createVoucherClass(body);
      }
      closeDrawer();
      await load();
    } catch (err) {
      logApiError("VoucherClassPage.submit", err);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!(await confirm({ title: "Delete this voucher class?", danger: true }))) return;
    try {
      await api.deleteVoucherClass(id);
      if (editingId === id) closeDrawer();
      await load();
    } catch (err) {
      logApiError("VoucherClassPage.delete", err);
      setError((err as Error).message);
    }
  }

  const acctName = new Map(accounts.map((a) => [a.id, `${a.account_number} — ${a.name}`]));

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Voucher Classes"
        description="Reusable templates with default ledger, narration, and line prefills."
      />

      <div className={listPageFilterBarClass}>
        <input
          type="search"
          aria-label="Search voucher classes"
          placeholder="Search class name…"
          className={listPageToolbarInputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add class
        </button>
      </div>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <div className={listPageTableCardClass}>
        <div className="max-h-[calc(100dvh-18rem)] overflow-auto">
          <table className={`${listTableBaseClass} min-w-[48rem]`}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={listTableThClass}>Name</th>
                <th className={listTableThClass}>Type</th>
                <th className={listTableThClass}>Default ledger</th>
                <th className={listTableThClass}>Lines</th>
                <th className={listTableThClass}>Flags</th>
                <th className={listTableThClass}>Status</th>
                <th className={listTableThClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{r.name}</td>
                  <td className={listTableTdClass}>{r.voucher_type}</td>
                  <td className={listTableTdClass}>
                    {r.default_ledger_id ? acctName.get(r.default_ledger_id) ?? `#${r.default_ledger_id}` : "—"}
                  </td>
                  <td className={listTableTdClass}>{r.line_templates?.length ?? 0}</td>
                  <td className={`${listTableTdClass} text-xs`}>
                    {[r.auto_tax && "Tax", r.auto_round_off && "Round", r.auto_bill_allocation && "Bill"]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className={listTableTdClass}>{r.is_active ? "Active" : "Inactive"}</td>
                  <td className={listTableTdClass}>
                    <RowActionsMenu
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      menuPortal
                      items={[
                        { key: "edit", label: "Edit", onClick: () => startEdit(r) },
                        { key: "delete", label: "Delete", danger: true, onClick: () => void remove(r.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td className={listPageEmptyClass} colSpan={7}>
                    {rows.length === 0 ? "No voucher classes yet." : "No classes match your search."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-text-muted">
          Showing {filteredRows.length} of {rows.length} class{rows.length === 1 ? "" : "es"}
        </div>
      </div>

      <FinanceFormDrawer
        open={drawerOpen}
        title={editingId ? "Edit class" : "Add class"}
        description="Reusable voucher template with optional line prefills."
        onClose={closeDrawer}
        onSubmit={(e) => void onSubmit(e)}
        submitLabel={editingId ? "Update" : "Create"}
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Class details">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="vc-name">
            Name *
          </label>
          <input
            id="vc-name"
            className={fieldClass}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="vc-type">
            Voucher type
          </label>
          <select
            id="vc-type"
            className={fieldClass}
            value={form.voucher_type}
            onChange={(e) => setForm((p) => ({ ...p, voucher_type: e.target.value }))}
          >
            {voucherTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="vc-ledger">
            Default ledger
          </label>
          <select
            id="vc-ledger"
            className={fieldClass}
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
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="vc-cc">
            Default cost center
          </label>
          <select
            id="vc-cc"
            className={fieldClass}
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
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="vc-narration">
            Default narration
          </label>
          <input
            id="vc-narration"
            className={fieldClass}
            value={form.default_narration}
            onChange={(e) => setForm((p) => ({ ...p, default_narration: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.auto_tax}
              onChange={(e) => setForm((p) => ({ ...p, auto_tax: e.target.checked }))}
            />
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
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted">Line templates</p>
          {lines.map((ln, idx) => (
            <div key={idx} className="space-y-2 rounded-lg border border-border p-2">
              <select
                className={fieldClass}
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
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={fieldClass}
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
                  className={fieldClass}
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
              </div>
              <div className="flex gap-2">
                <input
                  className={`${fieldClass} flex-1`}
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
                  className={listPageToolbarButtonClass}
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className={listPageToolbarButtonClass}
            onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
          >
            + Add line
          </button>
        </div>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
