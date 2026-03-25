import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type CurrencyExchangeRateCreate,
  type CurrencyExchangeRateResponse,
  type MultiCurrencyRevaluationResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function AccountsCurrencyPage() {
  const [rates, setRates] = useState<CurrencyExchangeRateResponse[]>([]);
  const [reval, setReval] = useState<MultiCurrencyRevaluationResponse | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<CurrencyExchangeRateCreate>({
    from_currency: "USD",
    to_currency: "BDT",
    exchange_rate: "120",
    effective_date: new Date().toISOString().slice(0, 10),
    source: "manual",
  });

  async function load() {
    try {
      setError("");
      const [list, rv] = await Promise.all([api.listCurrencyExchangeRates({ active_only: false }), api.getMultiCurrencyRevaluationSummary()]);
      setRates(list);
      setReval(rv);
    } catch (e) {
      logApiError("AccountsCurrencyPage.load", e);
      setError((e as Error).message);
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
      if (editingId) {
        await api.updateCurrencyExchangeRate(editingId, {
          exchange_rate: form.exchange_rate,
          effective_date: form.effective_date,
          source: form.source,
          is_active: true,
        });
        setEditingId(null);
      } else {
        await api.createCurrencyExchangeRate(form);
      }
      setForm({
        from_currency: "USD",
        to_currency: "BDT",
        exchange_rate: "120",
        effective_date: new Date().toISOString().slice(0, 10),
        source: "manual",
      });
      await load();
    } catch (e) {
      logApiError("AccountsCurrencyPage.submit", e);
      setError((e as Error).message);
    }
  }

  function startEdit(r: CurrencyExchangeRateResponse) {
    setEditingId(r.id);
    setForm({
      from_currency: r.from_currency,
      to_currency: r.to_currency,
      exchange_rate: String(r.exchange_rate),
      effective_date: r.effective_date.slice(0, 10),
      source: r.source ?? "manual",
    });
  }

  async function removeRate(id: number) {
    if (!window.confirm("Delete this exchange rate row?")) return;
    try {
      await api.deleteCurrencyExchangeRate(id);
      if (editingId === id) {
        setEditingId(null);
        setForm({
          from_currency: "USD",
          to_currency: "BDT",
          exchange_rate: "120",
          effective_date: new Date().toISOString().slice(0, 10),
          source: "manual",
        });
      }
      await load();
    } catch (e) {
      logApiError("AccountsCurrencyPage.deleteCurrencyExchangeRate", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Multi-Currency</h1>
          <p className="text-sm text-text-muted">Exchange rate maintenance and FX revaluation preview.</p>
        </div>
        <Link to="/app/finance/fx-receipts" className="text-sm font-medium text-brand-primary hover:underline">
          FX receipts →
        </Link>
      </div>
      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input className="rounded border px-3 py-2 text-sm" value={form.from_currency} onChange={(e) => setForm((p) => ({ ...p, from_currency: e.target.value.toUpperCase() }))} />
        <input className="rounded border px-3 py-2 text-sm" value={form.to_currency} onChange={(e) => setForm((p) => ({ ...p, to_currency: e.target.value.toUpperCase() }))} />
        <input className="rounded border px-3 py-2 text-sm" value={form.exchange_rate} onChange={(e) => setForm((p) => ({ ...p, exchange_rate: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.effective_date} onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Source" value={form.source ?? ""} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            {editingId ? "Save rate" : "Add rate"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => {
                setEditingId(null);
                setForm({
                  from_currency: "USD",
                  to_currency: "BDT",
                  exchange_rate: "120",
                  effective_date: new Date().toISOString().slice(0, 10),
                  source: "manual",
                });
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-2 text-lg font-semibold">Exchange Rates</h2>
        <p className="mb-2 text-xs text-text-muted">Click a row to load it into the form above, or use Actions to edit/delete.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-2 py-1">Pair</th>
                <th className="px-2 py-1">Rate</th>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Active</th>
                <th className="px-2 py-1 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer border-t hover:bg-surface-subtle ${editingId === r.id ? "bg-brand-primary/5" : ""}`}
                  onClick={() => startEdit(r)}
                >
                  <td className="px-2 py-1">
                    {r.from_currency}/{r.to_currency}
                  </td>
                  <td className="px-2 py-1">{r.exchange_rate}</td>
                  <td className="px-2 py-1">{r.effective_date}</td>
                  <td className="px-2 py-1">{r.source}</td>
                  <td className="px-2 py-1">{r.is_active ? "Yes" : "No"}</td>
                  <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
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
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              startEdit(r);
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
                              void removeRate(r.id);
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

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-2 text-lg font-semibold">Revaluation Summary</h2>
        {reval ? (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded border p-2 text-sm">
                Old Base: <b>{reval.total_old_base_amount.toLocaleString()}</b>
              </div>
              <div className="rounded border p-2 text-sm">
                New Base: <b>{reval.total_new_base_amount.toLocaleString()}</b>
              </div>
              <div className="rounded border p-2 text-sm">
                Gain/Loss: <b>{reval.total_gain_loss.toLocaleString()}</b>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left">
                  <tr>
                    <th className="px-2 py-1">Receipt</th>
                    <th className="px-2 py-1">Currency</th>
                    <th className="px-2 py-1">FC</th>
                    <th className="px-2 py-1">Old Base</th>
                    <th className="px-2 py-1">New Base</th>
                    <th className="px-2 py-1">Gain/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {reval.rows.map((r) => (
                    <tr key={r.receipt_id} className="border-t">
                      <td className="px-2 py-1">{r.receipt_no}</td>
                      <td className="px-2 py-1">{r.currency}</td>
                      <td className="px-2 py-1">{r.fc_amount.toLocaleString()}</td>
                      <td className="px-2 py-1">{r.old_base_amount.toLocaleString()}</td>
                      <td className="px-2 py-1">{r.new_base_amount.toLocaleString()}</td>
                      <td className="px-2 py-1">{r.gain_loss.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
