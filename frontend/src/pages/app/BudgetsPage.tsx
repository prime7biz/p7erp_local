import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type BudgetCreate,
  type BudgetLineCreate,
  type BudgetResponse,
  type BudgetVsActualResponse,
  type ChartOfAccountResponse,
  type CostCenterResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function linesToCreate(lines: BudgetResponse["lines"]): BudgetLineCreate[] {
  return lines.map((l) => ({
    account_id: l.account_id ?? null,
    cost_center_id: l.cost_center_id ?? null,
    period_month: l.period_month,
    amount: String(l.amount),
    notes: l.notes ?? null,
  }));
}

export function BudgetsPage() {
  const [fiscalYearFilter, setFiscalYearFilter] = useState("");
  const [budgets, setBudgets] = useState<BudgetResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterResponse[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [vsActual, setVsActual] = useState<BudgetVsActualResponse | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<BudgetCreate>({
    budget_name: "",
    fiscal_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    status: "DRAFT",
    lines: [{ account_id: null, cost_center_id: null, period_month: new Date().toISOString().slice(0, 7), amount: "0", notes: "" }],
  });

  async function load() {
    try {
      setError("");
      const [b, a, c] = await Promise.all([
        api.listBudgets(fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : undefined),
        api.listChartOfAccounts({ active_only: true }),
        api.listCostCenters({ active_only: true }),
      ]);
      setBudgets(b);
      setAccounts(a);
      setCostCenters(c);
      if (selectedBudgetId && !b.some((x) => x.id === selectedBudgetId)) {
        setSelectedBudgetId(null);
        setVsActual(null);
      } else if (selectedBudgetId) {
        setVsActual(await api.getBudgetVsActual(selectedBudgetId));
      }
    } catch (e) {
      logApiError("BudgetsPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBudgetId, fiscalYearFilter]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updateBudget(editingId, form);
        setEditingId(null);
      } else {
        await api.createBudget(form);
      }
      setForm({
        budget_name: "",
        fiscal_year: form.fiscal_year,
        status: "DRAFT",
        lines: [{ account_id: null, cost_center_id: null, period_month: new Date().toISOString().slice(0, 7), amount: "0", notes: "" }],
      });
      await load();
    } catch (e) {
      logApiError("BudgetsPage.submit", e);
      setError((e as Error).message);
    }
  }

  function startEdit(b: BudgetResponse) {
    setEditingId(b.id);
    setForm({
      budget_name: b.budget_name,
      fiscal_year: b.fiscal_year,
      status: b.status === "FINAL" ? "FINAL" : "DRAFT",
      lines: linesToCreate(b.lines).length ? linesToCreate(b.lines) : form.lines,
    });
  }

  async function removeBudget(id: number) {
    if (!window.confirm("Delete this budget and all its lines?")) return;
    try {
      await api.deleteBudget(id);
      if (selectedBudgetId === id) setSelectedBudgetId(null);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (e) {
      logApiError("BudgetsPage.deleteBudget", e);
      setError((e as Error).message);
    }
  }

  const chartMax = useMemo(() => {
    if (!vsActual?.rows?.length) return 1;
    return Math.max(
      ...vsActual.rows.map((r) => Math.max(Math.abs(r.budget_amount), Math.abs(r.actual_amount), Math.abs(r.variance))),
      1
    );
  }, [vsActual]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Budgets & Budget vs Actual</h1>
          <p className="text-sm text-text-muted">Create finance budgets and compare with posted actuals.</p>
        </div>
        <div>
          <label className="block text-xs text-text-muted">Fiscal year filter</label>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="e.g. 2025-2026 (empty = all)"
            value={fiscalYearFilter}
            onChange={(e) => setFiscalYearFilter(e.target.value.trim())}
          />
        </div>
      </div>
      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{editingId ? `Edit budget #${editingId}` : "New budget"}</h2>
          {editingId ? (
            <button
              type="button"
              className="text-sm text-text-muted hover:text-text-primary"
              onClick={() => {
                setEditingId(null);
                setForm({
                  budget_name: "",
                  fiscal_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
                  status: "DRAFT",
                  lines: [{ account_id: null, cost_center_id: null, period_month: new Date().toISOString().slice(0, 7), amount: "0", notes: "" }],
                });
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Budget Name" value={form.budget_name} onChange={(e) => setForm((p) => ({ ...p, budget_name: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Fiscal Year" value={form.fiscal_year} onChange={(e) => setForm((p) => ({ ...p, fiscal_year: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "DRAFT" | "FINAL" }))}>
            <option value="DRAFT">DRAFT</option>
            <option value="FINAL">FINAL</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-2 py-1">Month</th>
                <th className="px-2 py-1">Account</th>
                <th className="px-2 py-1">Cost Center</th>
                <th className="px-2 py-1">Amount</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1">
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      placeholder="YYYY-MM"
                      value={line.period_month}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, lines: p.lines.map((r, i) => (i === idx ? { ...r, period_month: e.target.value } : r)) }))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={line.account_id ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          lines: p.lines.map((r, i) => (i === idx ? { ...r, account_id: e.target.value ? Number(e.target.value) : null } : r)),
                        }))
                      }
                    >
                      <option value="">Any Account</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_number} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={line.cost_center_id ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          lines: p.lines.map((r, i) => (i === idx ? { ...r, cost_center_id: e.target.value ? Number(e.target.value) : null } : r)),
                        }))
                      }
                    >
                      <option value="">Any Cost Center</option>
                      {costCenters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.center_code} - {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      value={line.amount}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, lines: p.lines.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)) }))
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => setForm((p) => ({ ...p, lines: p.lines.filter((_, i) => i !== idx || p.lines.length === 1) }))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() =>
              setForm((p) => ({
                ...p,
                lines: [...p.lines, { account_id: null, cost_center_id: null, period_month: new Date().toISOString().slice(0, 7), amount: "0", notes: "" }],
              }))
            }
          >
            Add Line
          </button>
          <button className="rounded bg-brand-primary px-3 py-2 text-sm text-brand-primary-foreground">{editingId ? "Save budget" : "Create Budget"}</button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Budget List</h2>
          <select className="rounded border px-2 py-1 text-sm" value={selectedBudgetId ?? ""} onChange={(e) => setSelectedBudgetId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select for vs actual</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.budget_name} ({b.fiscal_year})
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-2 py-1">Budget</th>
                <th className="px-2 py-1">Fiscal Year</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Lines</th>
                <th className="px-2 py-1 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-2 py-1">{b.budget_name}</td>
                  <td className="px-2 py-1">{b.fiscal_year}</td>
                  <td className="px-2 py-1">{b.status}</td>
                  <td className="px-2 py-1">{b.lines.length}</td>
                  <td className="px-2 py-1 text-right">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId((id) => (id === b.id ? null : b.id));
                        }}
                      >
                        Actions
                      </button>
                      {openActionsId === b.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              startEdit(b);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              void removeBudget(b.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {vsActual ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-2 text-lg font-semibold">Budget vs Actual</h2>
          <div className="mb-3 grid gap-2 md:grid-cols-3 text-sm">
            <div className="rounded border p-2">
              Budget: <b>{vsActual.total_budget.toLocaleString()}</b>
            </div>
            <div className="rounded border p-2">
              Actual: <b>{vsActual.total_actual.toLocaleString()}</b>
            </div>
            <div className="rounded border p-2">
              Variance: <b>{vsActual.total_variance.toLocaleString()}</b>
            </div>
          </div>
          <div className="mb-6 space-y-2">
            <div className="text-sm font-medium text-text-secondary">Budget vs actual by period (bars)</div>
            {vsActual.rows.map((r) => (
              <div key={r.line_id} className="border-b border-border pb-2">
                <div className="mb-1 flex justify-between text-xs text-text-muted">
                  <span>{r.period_month}</span>
                  <span>
                    Var: {r.variance.toLocaleString()} ({r.variance_pct.toLocaleString()}%)
                  </span>
                </div>
                <div className="flex h-3 overflow-hidden rounded bg-surface-subtle">
                  <div
                    className="bg-brand-primary/60"
                    style={{ width: `${Math.min(100, (Math.abs(r.budget_amount) / chartMax) * 100)}%` }}
                    title={`Budget ${r.budget_amount}`}
                  />
                  <div
                    className="bg-status-success/70"
                    style={{ width: `${Math.min(100, (Math.abs(r.actual_amount) / chartMax) * 100)}%` }}
                    title={`Actual ${r.actual_amount}`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left">
                <tr>
                  <th className="px-2 py-1">Month</th>
                  <th className="px-2 py-1">Budget</th>
                  <th className="px-2 py-1">Actual</th>
                  <th className="px-2 py-1">Variance</th>
                  <th className="px-2 py-1">Variance %</th>
                </tr>
              </thead>
              <tbody>
                {vsActual.rows.map((r) => (
                  <tr key={r.line_id} className="border-t">
                    <td className="px-2 py-1">{r.period_month}</td>
                    <td className="px-2 py-1">{r.budget_amount.toLocaleString()}</td>
                    <td className="px-2 py-1">{r.actual_amount.toLocaleString()}</td>
                    <td className="px-2 py-1">{r.variance.toLocaleString()}</td>
                    <td className="px-2 py-1">{r.variance_pct.toLocaleString()}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
