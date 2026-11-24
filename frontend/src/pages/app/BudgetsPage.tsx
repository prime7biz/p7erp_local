import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  api,
  type BudgetCreate,
  type BudgetLineCreate,
  type BudgetResponse,
  type BudgetVsActualResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { currentMonthLocal } from "@/lib/dates";
import {
  fetchChartAccountPage,
  fetchCostCenterPage,
  hydrateChartAccount,
  hydrateCostCenter,
} from "@/lib/remoteSelectFetchers";
import { useConfirm } from "@/components/app/useConfirm";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageRootClass,
  listPageToolbarButtonClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import {
  FinanceFormDrawer,
  FinanceListToolbar,
  FormSection,
  ScrollTableCard,
  SummaryStrip,
  showingCountLabel,
} from "@/components/finance/kit";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

function emptyBudgetForm(fiscalYear?: string): BudgetCreate {
  const y = new Date().getFullYear();
  return {
    budget_name: "",
    fiscal_year: fiscalYear ?? `${y}-${y + 1}`,
    status: "DRAFT",
    lines: [{ account_id: null, cost_center_id: null, period_month: currentMonthLocal(), amount: "0", notes: "" }],
  };
}

function linesToCreate(lines: BudgetResponse["lines"]): BudgetLineCreate[] {
  return lines.map((l) => ({
    account_id: l.account_id ?? null,
    cost_center_id: l.cost_center_id ?? null,
    period_month: l.period_month,
    amount: String(l.amount),
    notes: l.notes ?? null,
  }));
}

type VsActualRow = BudgetVsActualResponse["rows"][number];

function linePeriodTitle(r: VsActualRow): string {
  if (r.period_start && r.period_end) return `Actuals counted from ${r.period_start} to ${r.period_end}`;
  return "Actuals counted for all dates (budget has no usable financial year)";
}

function actualTitle(r: VsActualRow): string {
  const rule =
    r.net_rule === "credit_minus_debit"
      ? "credit − debit"
      : r.net_rule === "per_account"
        ? "each account by its own nature"
        : "debit − credit";
  return `Debit ${r.actual_debit ?? 0} · Credit ${r.actual_credit ?? 0} · Net (${rule})`;
}

function utilizationBarClass(pct: number): string {
  if (pct >= 100) return "bg-status-danger";
  if (pct >= 90) return "bg-status-warning";
  return "bg-status-success";
}

export function BudgetsPage() {
  const confirm = useConfirm();
  const { me } = useAuth();
  const enforcementMode =
    typeof me?.feature_flags?.budget_enforcement_mode === "string"
      ? String(me.feature_flags.budget_enforcement_mode)
      : "off";
  const [fiscalYearFilter, setFiscalYearFilter] = useState("");
  const [budgets, setBudgets] = useState<BudgetResponse[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [vsActual, setVsActual] = useState<BudgetVsActualResponse | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BudgetCreate>(() => emptyBudgetForm());

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setError("");
      const b = await api.listBudgets(fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : undefined);
      if (!latest.isCurrent(token)) return;
      setBudgets(b);
      if (selectedBudgetId && !b.some((x) => x.id === selectedBudgetId)) {
        setSelectedBudgetId(null);
        setVsActual(null);
      } else if (selectedBudgetId) {
        const vs = await api.getBudgetVsActual(selectedBudgetId);
        if (!latest.isCurrent(token)) return;
        setVsActual(vs);
      }
    } catch (e) {
      logApiError("BudgetsPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, selectedBudgetId, fiscalYearFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
    setForm(emptyBudgetForm());
  }

  function openAdd() {
    setEditingId(null);
    setFormError(null);
    setForm(emptyBudgetForm());
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) {
        await api.updateBudget(editingId, form);
      } else {
        await api.createBudget(form);
      }
      setDrawerOpen(false);
      setEditingId(null);
      setForm(emptyBudgetForm(form.fiscal_year));
      await load();
    } catch (err) {
      logApiError("BudgetsPage.submit", err);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(b: BudgetResponse) {
    setEditingId(b.id);
    setFormError(null);
    setDrawerOpen(true);
    setForm({
      budget_name: b.budget_name,
      fiscal_year: b.fiscal_year,
      status: b.status === "FINAL" ? "FINAL" : "DRAFT",
      lines: linesToCreate(b.lines).length ? linesToCreate(b.lines) : form.lines,
    });
  }

  async function removeBudget(id: number) {
    if (!(await confirm({ title: "Delete this budget and all its lines?", danger: true }))) return;
    try {
      await api.deleteBudget(id);
      if (selectedBudgetId === id) setSelectedBudgetId(null);
      if (editingId === id) closeDrawer();
      await load();
    } catch (e) {
      logApiError("BudgetsPage.deleteBudget", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Budgets & Budget vs Actual"
        description="Create finance budgets and compare with posted actuals."
        actions={
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              enforcementMode === "block"
                ? "bg-status-danger-subtle text-status-danger-foreground"
                : enforcementMode === "warn"
                  ? "bg-status-warning-subtle text-status-warning-foreground"
                  : "bg-surface-subtle text-text-muted"
            }`}
          >
            Enforcement: {enforcementMode === "block" ? "Block" : enforcementMode === "warn" ? "Warn" : "Off"}
          </span>
        }
        belowTitle={
          <p className="text-xs text-text-muted">
            Tip: set budgets to <strong>FINAL</strong> and enable Budget enforcement in Settings → Configuration (
            <code className="mx-1 text-[11px]">off</code>/<code className="mx-1 text-[11px]">warn</code>/
            <code className="text-[11px]">block</code>) so voucher posting respects cost-center limits.
          </p>
        }
      />

      <FinanceListToolbar
        search={fiscalYearFilter}
        onSearchChange={(v) => setFiscalYearFilter(v.trim())}
        searchPlaceholder="Fiscal year filter, e.g. 2025-2026 (empty = all)"
        primaryAction={{ label: "New budget", onClick: openAdd }}
      />

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <ScrollTableCard
        maxHeight="panel"
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Budget List</h2>
            <LocalSearchSelect
              aria-label="Select budget for vs actual"
              className="min-w-[14rem]"
              value={selectedBudgetId ?? ""}
              options={budgets.map((b) => ({
                value: b.id,
                label: `${b.budget_name} (${b.fiscal_year})`,
              }))}
              onChange={(next) => setSelectedBudgetId(next === "" ? null : Number(next))}
              placeholder="Select for vs actual"
              allowClear
            />
          </div>
        }
        footer={showingCountLabel(budgets.length, budgets.length, "budget")}
      >
        <table className={`${listTableBaseClass} min-w-[36rem]`}>
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>Budget</th>
              <th className={listTableThClass}>Fiscal Year</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>Lines</th>
              <th className={listTableThClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {budgets.length === 0 ? (
              <tr>
                <td className={listPageEmptyClass} colSpan={5}>
                  No budgets yet.
                </td>
              </tr>
            ) : (
              budgets.map((b) => (
                <tr key={b.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{b.budget_name}</td>
                  <td className={listTableTdClass}>{b.fiscal_year}</td>
                  <td className={listTableTdClass}>{b.status}</td>
                  <td className={listTableTdClass}>{b.lines.length}</td>
                  <td className={listTableTdClass}>
                    <RowActionsMenu
                      rowId={b.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      menuPortal
                      items={[
                        { key: "edit", label: "Edit", onClick: () => startEdit(b) },
                        { key: "delete", label: "Delete", danger: true, onClick: () => void removeBudget(b.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableCard>

      {vsActual ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">Budget vs Actual</h2>
          <SummaryStrip
            items={[
              { key: "budget", label: "Budget", value: vsActual.total_budget.toLocaleString() },
              { key: "actual", label: "Actual (line periods)", value: vsActual.total_actual.toLocaleString() },
              { key: "variance", label: "Variance", value: vsActual.total_variance.toLocaleString() },
            ]}
          />
          <div className="space-y-2">
            <div className="text-sm font-medium text-text-secondary">
              Utilization by period (green ≤90%, yellow 90–100%, red &gt;100%)
            </div>
            {vsActual.rows.map((r) => {
              const utilPct =
                Math.abs(r.budget_amount) > 0
                  ? (Math.abs(r.actual_amount) / Math.abs(r.budget_amount)) * 100
                  : 0;
              return (
                <div key={r.line_id} className="border-b border-border pb-2">
                  <div className="mb-1 flex justify-between text-xs text-text-muted">
                    <span title={linePeriodTitle(r)}>{r.period_month}</span>
                    <span>
                      {utilPct.toFixed(0)}% used · Var: {r.variance.toLocaleString()} (
                      {r.variance_pct.toLocaleString()}%)
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded bg-surface-subtle">
                    <div
                      className={`h-full ${utilizationBarClass(utilPct)}`}
                      style={{ width: `${Math.min(100, utilPct)}%` }}
                      title={`Actual ${r.actual_amount} / Budget ${r.budget_amount}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollTableCard maxHeight="secondary">
            <table className={`${listTableBaseClass} min-w-[32rem]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass}>Period</th>
                  <th className={listTableThRightClass}>Budget</th>
                  <th
                    className={listTableThRightClass}
                    title="Posted vouchers in this line's period only. Expense/asset = debit − credit; income/liability/equity = credit − debit."
                  >
                    Actual (line period)
                  </th>
                  <th className={listTableThRightClass}>Variance</th>
                  <th className={listTableThRightClass}>Variance %</th>
                </tr>
              </thead>
              <tbody>
                {vsActual.rows.map((r) => (
                  <tr key={r.line_id} className={listTableTrClass}>
                    <td className={listTableTdPrimaryClass} title={linePeriodTitle(r)}>
                      {r.period_month}
                    </td>
                    <td className={`${listTableTdClass} text-right`}>{r.budget_amount.toLocaleString()}</td>
                    <td className={`${listTableTdClass} text-right`} title={actualTitle(r)}>
                      {r.actual_amount.toLocaleString()}
                    </td>
                    <td className={`${listTableTdClass} text-right`}>{r.variance.toLocaleString()}</td>
                    <td className={`${listTableTdClass} text-right`}>{r.variance_pct.toLocaleString()}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTableCard>
        </div>
      ) : null}

      <FinanceFormDrawer
        open={drawerOpen}
        size="xl"
        title={editingId ? `Edit budget #${editingId}` : "New budget"}
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel={editingId ? "Save budget" : "Create Budget"}
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Budget">
          <div>
            <label className={labelClass} htmlFor="bd-name">Budget name</label>
            <input id="bd-name" className={fieldClass} value={form.budget_name} onChange={(e) => setForm((p) => ({ ...p, budget_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="bd-fy">Fiscal year</label>
            <input id="bd-fy" className={fieldClass} value={form.fiscal_year} onChange={(e) => setForm((p) => ({ ...p, fiscal_year: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="bd-status">Status</label>
            <select id="bd-status" className={fieldClass} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "DRAFT" | "FINAL" }))}>
              <option value="DRAFT">DRAFT</option>
              <option value="FINAL">FINAL</option>
            </select>
          </div>
        </FormSection>

        <FormSection
          title="Budget lines"
          actions={
            <button
              type="button"
              className={listPageToolbarButtonClass}
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  lines: [...p.lines, { account_id: null, cost_center_id: null, period_month: currentMonthLocal(), amount: "0", notes: "" }],
                }))
              }
            >
              Add Line
            </button>
          }
        >
          <ScrollTableCard maxHeight="secondary">
            <table className={`${listTableBaseClass} min-w-[42rem]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass}>Month</th>
                  <th className={listTableThClass}>Account</th>
                  <th className={listTableThClass}>Cost Center</th>
                  <th className={listTableThClass}>Amount</th>
                  <th className={listTableThClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, idx) => (
                  <tr key={idx} className={listTableTrClass}>
                    <td className="px-3 py-2">
                      <input
                        className={fieldClass}
                        placeholder="YYYY-MM"
                        aria-label={`Line ${idx + 1} month`}
                        value={line.period_month}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            lines: p.lines.map((r, i) => (i === idx ? { ...r, period_month: e.target.value } : r)),
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <RemoteSearchSelect
                        className="w-full"
                        menuPortal
                        aria-label={`Line ${idx + 1} account`}
                        placeholder="Any account…"
                        value={line.account_id ?? ""}
                        onChange={(next) =>
                          setForm((p) => ({
                            ...p,
                            lines: p.lines.map((r, i) =>
                              i === idx ? { ...r, account_id: next === "" ? null : next } : r,
                            ),
                          }))
                        }
                        fetchPage={fetchChartAccountPage}
                        hydrateById={hydrateChartAccount}
                        allowClear
                      />
                    </td>
                    <td className="px-3 py-2">
                      <RemoteSearchSelect
                        className="w-full"
                        menuPortal
                        aria-label={`Line ${idx + 1} cost center`}
                        placeholder="Any cost center…"
                        value={line.cost_center_id ?? ""}
                        onChange={(next) =>
                          setForm((p) => ({
                            ...p,
                            lines: p.lines.map((r, i) =>
                              i === idx ? { ...r, cost_center_id: next === "" ? null : next } : r,
                            ),
                          }))
                        }
                        fetchPage={fetchCostCenterPage}
                        hydrateById={hydrateCostCenter}
                        allowClear
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={fieldClass}
                        aria-label={`Line ${idx + 1} amount`}
                        value={line.amount}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            lines: p.lines.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)),
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg border border-border-strong px-2 py-1 text-xs"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            lines: p.lines.filter((_, i) => i !== idx || p.lines.length === 1),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTableCard>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}