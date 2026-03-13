import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type BudgetCreate,
  type BudgetResponse,
  type BudgetVsActualResponse,
  type ChartOfAccountResponse,
  type CostCenterResponse,
} from "@/api/client";

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterResponse[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [vsActual, setVsActual] = useState<BudgetVsActualResponse | null>(null);
  const [error, setError] = useState("");
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
        api.listBudgets(),
        api.listChartOfAccounts({ active_only: true }),
        api.listCostCenters({ active_only: true }),
      ]);
      setBudgets(b);
      setAccounts(a);
      setCostCenters(c);
      if (selectedBudgetId) {
        setVsActual(await api.getBudgetVsActual(selectedBudgetId));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBudgetId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createBudget(form);
      setForm({
        budget_name: "",
        fiscal_year: form.fiscal_year,
        status: "DRAFT",
        lines: [{ account_id: null, cost_center_id: null, period_month: new Date().toISOString().slice(0, 7), amount: "0", notes: "" }],
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Budgets & Budget vs Actual</h1>
        <p className="text-sm text-slate-500">Create finance budgets and compare with posted actuals.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
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
            <thead className="bg-slate-50 text-left">
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
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Create Budget</button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
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
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-2 py-1">Budget</th>
                <th className="px-2 py-1">Fiscal Year</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Lines</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-2 py-1">{b.budget_name}</td>
                  <td className="px-2 py-1">{b.fiscal_year}</td>
                  <td className="px-2 py-1">{b.status}</td>
                  <td className="px-2 py-1">{b.lines.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {vsActual ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Budget vs Actual</h2>
          <div className="mb-3 grid gap-2 md:grid-cols-3 text-sm">
            <div className="rounded border p-2">Budget: <b>{vsActual.total_budget.toLocaleString()}</b></div>
            <div className="rounded border p-2">Actual: <b>{vsActual.total_actual.toLocaleString()}</b></div>
            <div className="rounded border p-2">Variance: <b>{vsActual.total_variance.toLocaleString()}</b></div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
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
