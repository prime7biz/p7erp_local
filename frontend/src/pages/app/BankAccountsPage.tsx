import { FormEvent, useEffect, useState } from "react";
import { api, type BankAccountCreate, type BankAccountResponse, type ChartOfAccountResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection, ScrollTableCard, showingCountLabel } from "@/components/finance/kit";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

const emptyForm: BankAccountCreate = {
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
};

export function BankAccountsPage() {
  const [rows, setRows] = useState<BankAccountResponse[]>([]);
  const [ledgers, setLedgers] = useState<ChartOfAccountResponse[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BankAccountCreate>({ ...emptyForm });

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

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
    setForm({ ...emptyForm });
  }

  function openAdd() {
    setEditingId(null);
    setFormError(null);
    setForm({ ...emptyForm });
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!form.account_name?.trim()) throw new Error("Account name is required");
      if (!form.bank_name?.trim()) throw new Error("Bank name is required");
      if (!form.account_number?.trim()) throw new Error("Account number is required");
      if (editingId) await api.updateBankAccount(editingId, form);
      else await api.createBankAccount(form);
      closeDrawer();
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: BankAccountResponse) {
    setEditingId(row.id);
    setFormError(null);
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
    setDrawerOpen(true);
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader title="Bank Accounts" description="Maintain bank master, linked ledger, and working balance." />

      <div className={listPageFilterBarClass}>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add bank account
        </button>
      </div>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <ScrollTableCard maxHeight="main" footer={showingCountLabel(rows.length, rows.length, "bank account")}>
        <table className={`${listTableBaseClass} min-w-[44rem]`}>
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>Account</th>
              <th className={listTableThClass}>Bank</th>
              <th className={listTableThClass}>Number</th>
              <th className={listTableThClass}>Currency</th>
              <th className={listTableThRightClass}>Current</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={listPageEmptyClass} colSpan={7}>
                  No bank accounts yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{r.account_name}</td>
                  <td className={listTableTdClass}>{r.bank_name}</td>
                  <td className={listTableTdClass}>{r.account_number}</td>
                  <td className={listTableTdClass}>{r.currency}</td>
                  <td className={`${listTableTdClass} text-right`}>{Number(r.current_balance).toLocaleString()}</td>
                  <td className={listTableTdClass}>{r.is_active ? "ACTIVE" : "INACTIVE"}</td>
                  <td className={listTableTdClass}>
                    <RowActionsMenu
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      menuPortal
                      items={[{ key: "edit", label: "Edit", onClick: () => startEdit(r) }]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableCard>

      <FinanceFormDrawer
        open={drawerOpen}
        title={editingId ? "Edit bank account" : "Add bank account"}
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel={editingId ? "Update" : "Create"}
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Account details">
          <div>
            <label className={labelClass} htmlFor="ba-name">Account name *</label>
            <input id="ba-name" className={fieldClass} value={form.account_name} onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ba-bank">Bank name *</label>
            <input id="ba-bank" className={fieldClass} value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ba-number">Account number *</label>
            <input id="ba-number" className={fieldClass} value={form.account_number} onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ba-gl">Linked GL account (optional)</label>
            <select
              id="ba-gl"
              className={fieldClass}
              value={form.gl_account_id ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, gl_account_id: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">None</option>
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.account_number} - {l.name}
                </option>
              ))}
            </select>
          </div>
        </FormSection>
        <FormSection title="Currency and balances">
          <div>
            <label className={labelClass} htmlFor="ba-cur">Currency (e.g. BDT)</label>
            <input id="ba-cur" className={fieldClass} value={form.currency ?? "BDT"} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ba-open">Opening balance</label>
            <input id="ba-open" className={fieldClass} value={form.opening_balance ?? "0"} onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ba-current">Current balance</label>
            <input id="ba-current" className={fieldClass} value={form.current_balance ?? "0"} onChange={(e) => setForm((p) => ({ ...p, current_balance: e.target.value }))} />
          </div>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
