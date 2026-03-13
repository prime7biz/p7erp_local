import { FormEvent, useEffect, useState } from "react";
import { api, type CashForecastScenarioCreate, type CashForecastScenarioResponse } from "@/api/client";

export function CashForecastPage() {
  const [rows, setRows] = useState<CashForecastScenarioResponse[]>([]);
  const [summary, setSummary] = useState<{ expected_inflows: number; expected_outflows: number; net_cash_flow: number; scenarios_count: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CashForecastScenarioCreate>({
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
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createCashForecastScenario(form);
      setForm({ ...form, name: "" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function generate(id: number) {
    try {
      await api.generateCashForecastScenario(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cash Forecast</h1>
        <p className="mt-1 text-sm text-slate-500">Scenario-based inflow/outflow planning copied from legacy finance workflow.</p>
      </div>

      {summary ? (
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Expected Inflow</div>
            <div className="text-xl font-semibold text-emerald-600">{summary.expected_inflows.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Expected Outflow</div>
            <div className="text-xl font-semibold text-rose-600">{summary.expected_outflows.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Net Cash</div>
            <div className="text-xl font-semibold">{summary.net_cash_flow.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Scenarios</div>
            <div className="text-xl font-semibold">{summary.scenarios_count}</div>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
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
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Create Scenario</button>
      </form>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded border bg-white px-3 py-4 text-sm text-slate-500">Loading scenarios...</div>
        ) : rows.length === 0 ? (
          <div className="rounded border bg-white px-3 py-4 text-sm text-slate-500">No scenarios yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    Start {r.start_date} | Months {r.months} | {r.status}
                  </div>
                </div>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => void generate(r.id)}>
                  Generate
                </button>
              </div>
              {r.lines.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left">
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
