import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type CurrencyExchangeRateCreate,
  type CurrencyExchangeRateResponse,
  type MultiCurrencyRevaluationResponse,
} from "@/api/client";

export function AccountsCurrencyPage() {
  const [rates, setRates] = useState<CurrencyExchangeRateResponse[]>([]);
  const [reval, setReval] = useState<MultiCurrencyRevaluationResponse | null>(null);
  const [error, setError] = useState("");
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
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createCurrencyExchangeRate(form);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Multi-Currency</h1>
        <p className="text-sm text-slate-500">Exchange rate maintenance and FX revaluation preview.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input className="rounded border px-3 py-2 text-sm" value={form.from_currency} onChange={(e) => setForm((p) => ({ ...p, from_currency: e.target.value.toUpperCase() }))} />
        <input className="rounded border px-3 py-2 text-sm" value={form.to_currency} onChange={(e) => setForm((p) => ({ ...p, to_currency: e.target.value.toUpperCase() }))} />
        <input className="rounded border px-3 py-2 text-sm" value={form.exchange_rate} onChange={(e) => setForm((p) => ({ ...p, exchange_rate: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.effective_date} onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Add Rate</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Exchange Rates</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-2 py-1">Pair</th>
                <th className="px-2 py-1">Rate</th>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Active</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1">
                    {r.from_currency}/{r.to_currency}
                  </td>
                  <td className="px-2 py-1">{r.exchange_rate}</td>
                  <td className="px-2 py-1">{r.effective_date}</td>
                  <td className="px-2 py-1">{r.source}</td>
                  <td className="px-2 py-1">{r.is_active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
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
                <thead className="bg-slate-50 text-left">
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
