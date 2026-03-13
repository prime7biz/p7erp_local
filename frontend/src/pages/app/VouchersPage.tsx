import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type ChartOfAccountResponse,
  type VoucherCreate,
  type VoucherLineCreate,
  type VoucherResponse,
} from "@/api/client";

const STATUSES = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"];
const ACTION_TO_STATUS: Record<string, string> = {
  submit: "SUBMITTED",
  check: "CHECKED",
  recommend: "RECOMMENDED",
  approve: "APPROVED",
  reject: "REJECTED",
  set_draft: "DRAFT",
  cancel: "CANCELLED",
};
const ACTION_LABEL: Record<string, string> = {
  submit: "Submit",
  check: "Check",
  recommend: "Recommend",
  approve: "Approve",
  post: "Post",
  reject: "Reject",
  set_draft: "Set Draft",
  cancel: "Cancel",
  reverse: "Reverse",
};

function workflowActionClass(action: string) {
  if (action === "reject") return "rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700";
  if (action === "post" || action === "approve") return "rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700";
  if (action === "check" || action === "recommend" || action === "submit") return "rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700";
  return "rounded border px-2 py-1 text-xs";
}

function rowAmount(lines: VoucherLineCreate[], t: "DEBIT" | "CREDIT") {
  return lines.filter((l) => l.entry_type === t).reduce((sum, l) => sum + Number(l.amount || 0), 0);
}

export function VouchersPage() {
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [rows, setRows] = useState<VoucherResponse[]>([]);
  const [availableActionMap, setAvailableActionMap] = useState<Record<number, string[]>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<VoucherCreate>({
    voucher_type: "JOURNAL",
    voucher_date: new Date().toISOString().slice(0, 10),
    description: "",
    reference: "",
    lines: [{ account_id: 0, entry_type: "DEBIT", amount: "0", notes: "" }],
  });
  const [focusTarget, setFocusTarget] = useState<{ row: number; cell: "account" | "debit" | "credit" | "notes" } | null>(null);

  async function load() {
    setLoading(true);
    setSuccess(null);
    setError(null);
    try {
      const [a, v] = await Promise.all([
        api.listChartOfAccounts({ active_only: true }),
        api.listVouchers(statusFilter ? { status_filter: statusFilter } : undefined),
      ]);
      const types = await api.getVoucherTypesMeta();
      setAccounts(a);
      setVoucherTypes(types);
      setRows(v);
      const actionPairs = await Promise.all(
        v.map(async (row) => {
          try {
            const meta = await api.getVoucherAvailableActions(row.id);
            return [row.id, meta.actions] as [number, string[]];
          } catch {
            return [row.id, []] as [number, string[]];
          }
        }),
      );
      const actionMap: Record<number, string[]> = {};
      for (const [id, actions] of actionPairs) actionMap[id] = actions;
      setAvailableActionMap(actionMap);
      const firstAccountId = a[0]?.id;
      if (form.lines[0]?.account_id === 0 && firstAccountId) {
        setForm((p) => {
          const firstLine = p.lines[0];
          if (!firstLine) return p;
          return { ...p, lines: [{ ...firstLine, account_id: firstAccountId }] };
        });
      }
      if (types.length > 0 && !types.includes(form.voucher_type) && types[0]) {
        setForm((p) => ({ ...p, voucher_type: types[0] as string }));
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
  }, [statusFilter]);

  const debitTotal = useMemo(() => rowAmount(form.lines, "DEBIT"), [form.lines]);
  const creditTotal = useMemo(() => rowAmount(form.lines, "CREDIT"), [form.lines]);
  const isBalanced = Math.abs(debitTotal - creditTotal) < 0.001;
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (r) =>
        r.voucher_number.toLowerCase().includes(query) ||
        r.voucher_type.toLowerCase().includes(query) ||
        (r.reference ?? "").toLowerCase().includes(query) ||
        (r.description ?? "").toLowerCase().includes(query),
    );
  }, [rows, search]);

  function setLineAccount(idx: number, accountId: number) {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((r, i) => (i === idx ? { ...r, account_id: accountId } : r)),
    }));
  }

  function setLineNotes(idx: number, notes: string) {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((r, i) => (i === idx ? { ...r, notes } : r)),
    }));
  }

  function focusLineCell(row: number, cell: "account" | "debit" | "credit" | "notes") {
    setFocusTarget({ row, cell });
  }

  function addLine(entryType: "DEBIT" | "CREDIT" = "DEBIT", focusCell: "account" | "debit" | "credit" | "notes" = "account") {
    const nextRow = form.lines.length;
    setForm((p) => ({
      ...p,
      lines: [
        ...p.lines,
        {
          account_id: accounts[0]?.id ?? 0,
          entry_type: entryType,
          amount: "0",
          notes: "",
        },
      ],
    }));
    focusLineCell(nextRow, focusCell);
  }

  function copyLine(idx: number) {
    setForm((p) => {
      const source = p.lines[idx];
      if (!source) return p;
      return {
        ...p,
        lines: [
          ...p.lines,
          {
            account_id: source.account_id,
            entry_type: source.entry_type,
            amount: source.amount,
            notes: source.notes ?? "",
          },
        ],
      };
    });
    focusLineCell(form.lines.length, "account");
  }

  function setLineSideAmount(idx: number, side: "DEBIT" | "CREDIT", value: string) {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((r, i) => (i === idx ? { ...r, entry_type: side, amount: value } : r)),
    }));
  }

  function autoBalanceVoucher() {
    const diff = debitTotal - creditTotal;
    if (Math.abs(diff) < 0.001) {
      setSuccess("Voucher is already balanced.");
      return;
    }
    const entryType: "DEBIT" | "CREDIT" = diff > 0 ? "CREDIT" : "DEBIT";
    const amount = Math.abs(diff).toFixed(2);
    setForm((p) => ({
      ...p,
      lines: [
        ...p.lines,
        {
          account_id: accounts[0]?.id ?? 0,
          entry_type: entryType,
          amount,
          notes: "Auto balance line",
        },
      ],
    }));
    focusLineCell(form.lines.length, "account");
    setSuccess("Auto balance line added. Select correct account before submit.");
  }

  function validateVoucherForm() {
    if (!form.voucher_type.trim()) throw new Error("Voucher type is required");
    if (!form.voucher_date) throw new Error("Voucher date is required");
    if (form.lines.length < 2) throw new Error("Use at least two lines (debit + credit)");
    if (form.lines.some((line) => !line.account_id)) throw new Error("Select account for each line");
    if (form.lines.some((line) => Number(line.amount) <= 0)) throw new Error("Line amount must be greater than zero");
    if (!isBalanced) throw new Error("Voucher is not balanced");
  }

  function resetVoucherForm() {
    setForm((p) => ({
      ...p,
      description: "",
      reference: "",
      lines: [{ account_id: accounts[0]?.id ?? 0, entry_type: "DEBIT", amount: "0", notes: "" }],
    }));
    focusLineCell(0, "account");
  }

  async function createVoucher(quickSubmit: boolean) {
    setSuccess(null);
    setError(null);
    try {
      validateVoucherForm();
      const created = await api.createVoucher(form);
      if (quickSubmit) {
        await api.updateVoucherStatus(created.id, "SUBMITTED");
      }
      resetVoucherForm();
      setSuccess(quickSubmit ? "Voucher created and submitted for approval." : "Voucher created successfully.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await createVoucher(false);
  }

  async function takeAction(id: number, action: string) {
    try {
      if (action === "post") {
        await api.postVoucher(id);
      } else if (action === "reverse") {
        await api.reverseVoucher(id);
      } else {
        const mappedStatus = ACTION_TO_STATUS[action];
        if (!mappedStatus) throw new Error(`Unsupported action: ${action}`);
        await api.updateVoucherStatus(id, mappedStatus);
      }
      setSuccess(`Voucher action completed: ${ACTION_LABEL[action] ?? action}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!focusTarget) return;
    const el = document.getElementById(`voucher-line-${focusTarget.row}-${focusTarget.cell}`) as HTMLInputElement | HTMLSelectElement | null;
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement && el.type !== "date") el.select();
    }
    setFocusTarget(null);
  }, [focusTarget, form.lines.length]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Vouchers</h1>
        <p className="mt-1 text-sm text-slate-500">Journal-style voucher entry with workflow actions and balances.</p>
      </div>

      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
            e.preventDefault();
            void createVoucher(true);
          } else if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            void createVoucher(false);
          }
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="grid gap-3 md:grid-cols-4">
          <select className="rounded border px-3 py-2 text-sm" value={form.voucher_type} onChange={(e) => setForm((p) => ({ ...p, voucher_type: e.target.value }))}>
            {voucherTypes.length === 0 ? <option value="JOURNAL">JOURNAL</option> : null}
            {voucherTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={form.voucher_date}
            onChange={(e) => setForm((p) => ({ ...p, voucher_date: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Reference"
            value={form.reference ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Description"
            value={form.description ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </div>

        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">
                    <select
                      id={`voucher-line-${idx}-account`}
                      className="w-full rounded border px-2 py-1"
                      value={line.account_id}
                      onChange={(e) => setLineAccount(idx, Number(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusLineCell(idx, "debit");
                        }
                      }}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_number} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      id={`voucher-line-${idx}-debit`}
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded border px-2 py-1 text-right"
                      value={line.entry_type === "DEBIT" ? line.amount : ""}
                      onChange={(e) => setLineSideAmount(idx, "DEBIT", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
                          e.preventDefault();
                          copyLine(idx);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          focusLineCell(idx, "credit");
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      id={`voucher-line-${idx}-credit`}
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded border px-2 py-1 text-right"
                      value={line.entry_type === "CREDIT" ? line.amount : ""}
                      onChange={(e) => setLineSideAmount(idx, "CREDIT", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
                          e.preventDefault();
                          copyLine(idx);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          focusLineCell(idx, "notes");
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      id={`voucher-line-${idx}-notes`}
                      className="w-full rounded border px-2 py-1"
                      value={line.notes ?? ""}
                      onChange={(e) => setLineNotes(idx, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
                          e.preventDefault();
                          copyLine(idx);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          addLine(line.entry_type, "account");
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => copyLine(idx)}>
                        Copy
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() =>
                          setForm((p) => ({ ...p, lines: p.lines.filter((_, i) => i !== idx || p.lines.length === 1) }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => addLine("DEBIT")}>
              Add Debit
            </button>
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => addLine("CREDIT")}>
              Add Credit
            </button>
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={autoBalanceVoucher}>
              Auto Balance
            </button>
          </div>
          <div className="text-sm">
            Debit: <b>{debitTotal.toFixed(2)}</b> | Credit: <b>{creditTotal.toFixed(2)}</b> |{" "}
            <span className={isBalanced ? "text-emerald-600" : "text-rose-600"}>{isBalanced ? "Balanced" : "Not Balanced"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700"
              onClick={() => void createVoucher(true)}
            >
              Create and Submit
            </button>
            <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Create Draft</button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Shortcuts: Enter moves to next cell; Enter on Notes adds new line; Ctrl+D duplicates current line; Ctrl+Enter creates voucher; Ctrl+Shift+Enter creates and submits.
        </p>
      </form>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Voucher List</h2>
          <div className="flex flex-wrap gap-2">
            <select className="rounded border px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded border px-3 py-1 text-sm md:w-72"
              placeholder="Search no/type/reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Workflow</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-5 text-slate-500" colSpan={6}>
                    Loading vouchers...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 text-slate-500" colSpan={6}>
                    No vouchers found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const amount = r.lines.filter((l) => l.entry_type === "DEBIT").reduce((s, l) => s + Number(l.amount || 0), 0);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.voucher_number}</td>
                      <td className="px-3 py-2">{r.voucher_date}</td>
                      <td className="px-3 py-2">{r.voucher_type}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs">{r.status}</span>
                      </td>
                      <td className="px-3 py-2">{amount.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(availableActionMap[r.id] ?? []).map((action) => (
                            <button key={action} className={workflowActionClass(action)} onClick={() => void takeAction(r.id, action)}>
                              {ACTION_LABEL[action] ?? action}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
