/**
 * Currency Management (PrimeX parity).
 * Manage exchange rates for multi-currency transactions.
 */
import { useEffect, useState } from "react";
import { api, type CurrencyExchangeRateResponse } from "@/api/client";
import { getCurrencySymbol, CURRENCY_CODES } from "@/lib/currency";

const today = () => new Date().toISOString().slice(0, 10);

export function CurrencyManagementPage() {
  const [rates, setRates] = useState<CurrencyExchangeRateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("BDT");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [source, setSource] = useState("manual");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.listCurrencyExchangeRates({ active_only: false });
      setRates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exchange rates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFromCurrency("USD");
    setToCurrency("BDT");
    setExchangeRate("1");
    setEffectiveDate(today());
    setSource("manual");
    setFormOpen(false);
  };

  const handleEdit = (r: CurrencyExchangeRateResponse) => {
    setEditingId(r.id);
    setFromCurrency(r.from_currency);
    setToCurrency(r.to_currency);
    setExchangeRate(r.exchange_rate);
    setEffectiveDate(r.effective_date.slice(0, 10));
    setSource(r.source);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromCurrency === toCurrency) {
      setError("From and To currencies cannot be the same.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingId) {
        await api.updateCurrencyExchangeRate(editingId, {
          exchange_rate: exchangeRate,
          effective_date: effectiveDate,
          source,
        });
        setSuccess("Exchange rate updated.");
      } else {
        await api.createCurrencyExchangeRate({
          from_currency: fromCurrency,
          to_currency: toCurrency,
          exchange_rate: exchangeRate,
          effective_date: effectiveDate,
          source,
        });
        setSuccess("Exchange rate added.");
      }
      await load();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this exchange rate?")) return;
    setError("");
    try {
      await api.deleteCurrencyExchangeRate(id);
      setSuccess("Exchange rate deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Currency Management</h2>
          <p className="text-text-secondary text-sm mt-0.5">
            Manage exchange rates for multi-currency transactions
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setFormOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
        >
          Add exchange rate
        </button>
      </div>

      {(error || success) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-status-success-subtle border border-status-success/30 px-4 py-3 text-sm text-status-success-foreground">
              {success}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            {editingId ? "Edit exchange rate" : "Add exchange rate"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-0.5">
                  From currency
                </label>
                <select
                  value={fromCurrency}
                  onChange={(e) => setFromCurrency(e.target.value)}
                  disabled={!!editingId}
                  className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm"
                >
                  {CURRENCY_CODES.map((c) => (
                    <option key={c} value={c}>
                      {getCurrencySymbol(c)} {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-0.5">
                  To currency
                </label>
                <select
                  value={toCurrency}
                  onChange={(e) => setToCurrency(e.target.value)}
                  disabled={!!editingId}
                  className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm"
                >
                  {CURRENCY_CODES.map((c) => (
                    <option key={c} value={c}>
                      {getCurrencySymbol(c)} {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-0.5">
                Exchange rate (1 {fromCurrency} = ? {toCurrency})
              </label>
              <input
                type="number"
                step="0.000001"
                min="0.000001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-0.5">
                  Effective date
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-0.5">
                  Source
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm"
                >
                  <option value="manual">Manual</option>
                  <option value="api">API</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : editingId ? "Update" : "Add rate"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-border-strong px-4 py-1.5 text-sm text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <h3 className="text-sm font-semibold text-text-primary p-4 border-b border-border">
          Exchange rates
        </h3>
        {loading ? (
          <div className="p-8 text-center text-text-muted">Loading…</div>
        ) : rates.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No exchange rates yet. Add one above to enable multi-currency support.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Currency pair</th>
                  <th className="py-2 px-4">Rate</th>
                  <th className="py-2 px-4">Effective date</th>
                  <th className="py-2 px-4">Source</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 px-4 font-medium text-text-primary">
                      {r.from_currency} → {r.to_currency}
                    </td>
                    <td className="py-2 px-4 text-text-secondary font-mono">
                      1 {r.from_currency} = {Number(r.exchange_rate).toFixed(6)} {r.to_currency}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {new Date(r.effective_date).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">{r.source}</td>
                    <td className="py-2 px-4">
                      <span
                        className={
                          r.is_active
                            ? "text-status-success font-medium"
                            : "text-text-muted"
                        }
                      >
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(r)}
                        className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="rounded border border-status-danger/20 px-2 py-1 text-xs text-status-danger hover:bg-status-danger-subtle"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
