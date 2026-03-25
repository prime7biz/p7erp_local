import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CashForecastScenarioCreate, type CashForecastScenarioResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function CashForecastPage() {
  const [rows, setRows] = useState<CashForecastScenarioResponse[]>([]);
  const [summary, setSummary] = useState<{ expected_inflows: number; expected_outflows: number; net_cash_flow: number; scenarios_count: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [editingScenarioId, setEditingScenarioId] = useState<number | null>(null);
  const [form, setForm] = useState<CashForecastScenarioCreate>({
    name: "",
    start_date: new Date().toISOString().slice(0, 10),
    months: 6,
  });
  const [editForm, setEditForm] = useState<CashForecastScenarioCreate>({
    name: "",
    start_date: new Date().toISOString().slice(0, 10),
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

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createCashForecastScenario(form);
      setForm({ ...form, name: "" });
      await load();
    } catch (e) {
      logApiError("CashForecastPage.createCashForecastScenario", e);
      setError((e as Error).message);
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
    if (!window.confirm("Delete this scenario and its lines?")) return;
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
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Cash Forecast</h1>
          <p className="mt-1 text-sm text-text-muted">Scenario-based inflow/outflow planning; BTB LC maturities can be merged on generate (server).</p>
        </div>
        <Link to="/app/cashflow/calendar" className="text-sm font-medium text-brand-primary hover:underline">
          Cashflow calendar →
        </Link>
      </div>

      {summary ? (
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Expected Inflow</div>
            <div className="text-xl font-semibold text-status-success">{summary.expected_inflows.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Expected Outflow</div>
            <div className="text-xl font-semibold text-status-danger-foreground">{summary.expected_outflows.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Net Cash</div>
            <div className="text-xl font-semibold">{summary.net_cash_flow.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Scenarios</div>
            <div className="text-xl font-semibold">{summary.scenarios_count}</div>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-4">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Scenario Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />
        <input
          type="date"
          className="rounded border px-3 py-2 text-sm"
          value={form.start_date}
          onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
        />
        <input
          type="number"
          min={1}
          max={24}
          className="rounded border px-3 py-2 text-sm"
          value={form.months ?? 6}
          onChange={(e) => setForm((p) => ({ ...p, months: Number(e.target.value) }))}
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
        >
          Create Scenario
        </button>
      </form>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded border bg-surface-raised px-3 py-4 text-sm text-text-muted">Loading scenarios...</div>
        ) : rows.length === 0 ? (
          <div className="rounded border bg-surface-raised px-3 py-4 text-sm text-text-muted">No scenarios yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-text-muted">
                    Start {r.start_date} | Months {r.months} | {r.status}
                  </div>
                </div>
                <div className="relative inline-block text-left">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenActionsId((id) => (id === r.id ? null : r.id));
                    }}
                  >
                    Actions
                  </button>
                  {openActionsId === r.id && (
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          setEditingScenarioId(r.id);
                          setEditForm({
                            name: r.name,
                            start_date: r.start_date,
                            months: r.months,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          void generate(r.id);
                        }}
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          void removeScenario(r.id);
                        }}
                      >
                        Delete scenario
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {editingScenarioId === r.id ? (
                <div className="mb-3 grid gap-2 rounded-lg border border-border bg-surface-subtle p-3 md:grid-cols-4">
                  <input
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="Scenario Name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="rounded border px-2 py-1 text-sm"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm((p) => ({ ...p, start_date: e.target.value }))}
                  />
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="rounded border px-2 py-1 text-sm"
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
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-subtle text-left">
                      <tr>
                        <th className="px-2 py-1">Month</th>
                        <th className="px-2 py-1">Inflow</th>
                        <th className="px-2 py-1">Outflow</th>
                        <th className="px-2 py-1">Net</th>
                        <th className="px-2 py-1">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.lines.map((line) => (
                        <tr key={line.id} className="border-t">
                          <td className="px-2 py-1">{line.month_label}</td>
                          <td className="px-2 py-1">{Number(line.inflow).toLocaleString()}</td>
                          <td className="px-2 py-1">{Number(line.outflow).toLocaleString()}</td>
                          <td className="px-2 py-1">{Number(line.net).toLocaleString()}</td>
                          <td className="px-2 py-1">{Number(line.cumulative).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
