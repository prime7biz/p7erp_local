import { FormEvent, useEffect, useState } from "react";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { listPageRootClass } from "@/components/app/listPageLayout";
import {
  createSubAccount,
  listSubAccounts,
  subAccountRegister,
  updateSubAccount,
  type SubAccount,
  type SubAccountRegisterRow,
} from "@/api/subLedger";
import { logApiError } from "@/utils/logApiError";

const FIELD = "w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm";

const CATEGORIES = [
  { value: "EMPLOYEE_ADVANCE", label: "Staff advance" },
  { value: "HAND_LOAN_LENDER", label: "Hand loan (we took)" },
  { value: "LOAN_BORROWER", label: "Hand loan (we gave)" },
  { value: "PARTY", label: "Party" },
  { value: "OTHER", label: "Other" },
];

export function SubLedgerRegisterPage() {
  const [people, setPeople] = useState<SubAccount[]>([]);
  const [balances, setBalances] = useState<SubAccountRegisterRow[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<SubAccount | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("EMPLOYEE_ADVANCE");

  async function load() {
    const [rows, register] = await Promise.all([listSubAccounts(), subAccountRegister()]);
    setPeople(rows);
    setBalances(register);
  }

  useEffect(() => {
    load().catch((e) => {
      logApiError("SubLedgerRegisterPage.load", e);
      setError("Could not load sub-accounts. Turn on Sub-account tracking in Settings if this company does not use it yet.");
    });
  }, []);

  function startEdit(row: SubAccount) {
    setEditing(row);
    setCode(row.code);
    setName(row.name);
    setCategory(row.category);
    setOpenId(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editing) {
        await updateSubAccount(editing.id, { ...editing, code, name, category });
      } else {
        await createSubAccount({ code, name, category });
      }
      setEditing(null);
      setCode("");
      setName("");
      await load();
    } catch (e) {
      logApiError("SubLedgerRegisterPage.save", e);
      setError("Could not save this person. Check the code is unique and you are allowed to change finance masters.");
    }
  }

  const balanceById = new Map(balances.map((row) => [row.id, row]));

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Sub-account register"
        description="People tracked under one control ledger, such as staff advances and non-interest hand loans."
      />
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <form onSubmit={onSubmit} className="mb-4 grid gap-2 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-4">
        <input className={FIELD} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input className={FIELD} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-brand-primary px-3 py-2 text-sm text-white">
          {editing ? "Save person" : "Add person"}
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-xs text-text-muted">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-text-muted">
                  No people yet. Add the first person above.
                </td>
              </tr>
            ) : (
              people.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">{row.code}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{CATEGORIES.find((item) => item.value === row.category)?.label ?? row.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{balanceById.get(row.id)?.net ?? "0.0000"}</td>
                  <td className="px-3 py-2">
                    <RowActionsMenu
                      rowId={row.id}
                      openId={openId}
                      onOpenChange={(id) => setOpenId(id == null ? null : Number(id))}
                      menuPortal
                      items={[
                        { key: "edit", label: "Edit", onClick: () => startEdit(row) },
                        {
                          key: "active",
                          label: row.is_active ? "Mark inactive" : "Mark active",
                          onClick: () => {
                            void updateSubAccount(row.id, { ...row, is_active: !row.is_active }).then(load);
                          },
                        },
                      ]}
                    />
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
