import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CashForecastScenarioCreate, type CashForecastScenarioResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";
import { useConfirm } from "@/components/app/useConfirm";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageTableCardClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FinanceListToolbar, FormSection, ScrollTableCard, SummaryStrip } from "@/components/finance/kit";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

export function CashForecastPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<CashForecastScenarioResponse[]>([]);
  const [summary, setSummary] = useState<{ expected_inflows: number; expected_outflows: number; net_cash_flow: number; scenarios_count: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<number | null>(null);
  const [form, setForm] = useState<CashForecastScenarioCreate>({
    name: "",
    start_date: todayLocalISO(),
    months: 6,
  });
  const [editForm, setEditForm] = useState<CashForecastScenarioCreate>({
    name: "",
    start_date: todayLocalISO(),
    months: 6,
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [scenarios, s] = await Promise.all([api.listCashForecastScenarios(), api.getCashForecastSummary()]);
      setRows(scenarios);
      setSummary(s);
    } catch (e) {
      logApiError("CashForecastPage.load", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openAdd() {
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.createCashForecastScenario(form);
      setForm({ ...form, name: "" });
      closeDrawer();
      await load();
    } catch (err) {
      logApiError("CashForecastPage.createCashForecastScenario", err);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function generate(id: number) {
    try {
      await api.generateCashForecastScenario(id);
      await load();
    } catch (e) {
      logApiError("CashForecastPage.generateCashForecastScenario", e);
      setError((e as Error).message);
    }
  }

  async function removeScenario(id: number) {
    if (!(await confirm({ title: "Delete this scenario and its lines?", danger: true }))) return;
    try {
      await api.deleteCashForecastScenario(id);
      await load();
    } catch (e) {
      logApiError("CashForecastPage.deleteCashForecastScenario", e);
      setError((e as Error).message);
    }
  }

  async function saveEditScenario() {
    if (!editingScenarioId) return;
    try {
      await api.updateCashForecastScenario(editingScenarioId, {
        name: editForm.name,
        start_date: editForm.start_date,
        months: editForm.months,
      });
      setEditingScenarioId(null);
      await load();
    } catch (e) {
      logApiError("CashForecastPage.updateCashForecastScenario", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Cash Forecast"
        description="Scenario-based inflow/outflow planning; BTB LC maturities can be merged on generate (server)."
        actions={
          <Link to="/app/cashflow/calendar" className="text-sm font-medium text-brand-primary hover:underline">
            Cashflow calendar →
          </Link>
        }
      />

      {summary ? (
        <SummaryStrip
          items={[
            { key: "in", label: "Expected Inflow", value: summary.expected_inflows.toLocaleString(), tone: "success" },
            { key: "out", label: "Expected Outflow", value: summary.expected_outflows.toLocaleString(), tone: "danger" },
            { key: "net", label: "Net Cash", value: summary.net_cash_flow.toLocaleString() },
            { key: "count", label: "Scenarios", value: summary.scenarios_count },
          ]}
        />
      ) : null}

      <FinanceListToolbar primaryAction={{ label: "Create scenario", onClick: openAdd }} />

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <div className="space-y-3">
        {loading ? (
          <div className={`${listPageTableCardClass} ${listPageLoadingClass}`}>Loading scenarios...</div>
        ) : rows.length === 0 ? (
          <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>No scenarios yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-text-primary">{r.name}</div>
                  <div className="text-xs text-text-muted">
                    Start {r.start_date} | Months {r.months} | {r.status}
                  </div>
                </div>
                <RowActionsMenu
                  rowId={r.id}
                  openId={openActionsId}
                  onOpenChange={setOpenActionsId}
                  menuPortal
                  items={[
                    {
                      key: "edit",
                      label: "Edit",
                      onClick: () => {
                        setEditingScenarioId(r.id);
                        setEditForm({ name: r.name, start_date: r.start_date, months: r.months });
                      },
                    },
                    { key: "generate", label: "Generate", onClick: () => void generate(r.id) },
                    { key: "delete", label: "Delete scenario", danger: true, onClick: () => void removeScenario(r.id) },
                  ]}
                />
              </div>
              {editingScenarioId === r.id ? (
                <div className="mb-3 grid gap-2 rounded-lg border border-border bg-surface-subtle p-3 md:grid-cols-4">
                  <input
                    className={fieldClass}
                    placeholder="Scenario Name"
                    aria-label="Edit scenario name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <input
                    type="date"
                    className={fieldClass}
                    aria-label="Edit scenario start date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm((p) => ({ ...p, start_date: e.target.value }))}
                  />
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className={fieldClass}
                    aria-label="Edit scenario months"
                    value={editForm.months ?? 6}
                    onChange={(e) => setEditForm((p) => ({ ...p, months: Number(e.target.value) }))}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEditScenario()}
                      className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-primary/90"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingScenarioId(null)}
                      className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {r.lines.length > 0 ? (
                <ScrollTableCard maxHeight="secondary">
                  <table className={`${listTableBaseClass} min-w-[32rem]`}>
                    <thead className={listTableTheadClass}>
                      <tr>
                        <th className={listTableThClass}>Month</th>
                        <th className={listTableThRightClass}>Inflow</th>
                        <th className={listTableThRightClass}>Outflow</th>
                        <th className={listTableThRightClass}>Net</th>
                        <th className={listTableThRightClass}>Cumulative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.lines.map((line) => (
                        <tr key={line.id} className={listTableTrClass}>
                          <td className={listTableTdPrimaryClass}>{line.month_label}</td>
                          <td className={`${listTableTdClass} text-right`}>{Number(line.inflow).toLocaleString()}</td>
                          <td className={`${listTableTdClass} text-right`}>{Number(line.outflow).toLocaleString()}</td>
                          <td className={`${listTableTdClass} text-right`}>{Number(line.net).toLocaleString()}</td>
                          <td className={`${listTableTdClass} text-right`}>{Number(line.cumulative).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollTableCard>
              ) : null}
            </div>
          ))
        )}
      </div>

      <FinanceFormDrawer
        open={drawerOpen}
        title="Create scenario"
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel="Create Scenario"
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Scenario">
          <div>
            <label className={labelClass} htmlFor="cf-name">Scenario name</label>
            <input id="cf-name" className={fieldClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cf-start">Start date</label>
            <input id="cf-start" type="date" className={fieldClass} value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cf-months">Months</label>
            <input id="cf-months" type="number" min={1} max={24} className={fieldClass} value={form.months ?? 6} onChange={(e) => setForm((p) => ({ ...p, months: Number(e.target.value) }))} />
          </div>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}