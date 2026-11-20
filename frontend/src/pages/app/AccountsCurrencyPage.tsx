import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type CurrencyExchangeRateCreate,
  type CurrencyExchangeRateResponse,
  type MultiCurrencyRevaluationResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarInputClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection } from "@/components/finance/kit";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";
import { useConfirm } from "@/components/app/useConfirm";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

function defaultForm(): CurrencyExchangeRateCreate {
  return {
    from_currency: "USD",
    to_currency: "BDT",
    exchange_rate: "120",
    effective_date: todayLocalISO(),
    source: "manual",
  };
}

export function AccountsCurrencyPage() {
  const confirm = useConfirm();
  const [rates, setRates] = useState<CurrencyExchangeRateResponse[]>([]);
  const [reval, setReval] = useState<MultiCurrencyRevaluationResponse | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CurrencyExchangeRateCreate>(defaultForm);

  async function load() {
    try {
      setError("");
      const [list, rv] = await Promise.all([
        api.listCurrencyExchangeRates({ active_only: false }),
        api.getMultiCurrencyRevaluationSummary(),
      ]);
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

  const filteredRates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter(
      (r) =>
        r.from_currency.toLowerCase().includes(q) ||
        r.to_currency.toLowerCase().includes(q) ||
        `${r.from_currency}/${r.to_currency}`.toLowerCase().includes(q),
    );
  }, [rates, search]);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
    setForm(defaultForm());
  }

  function openAdd() {
    setEditingId(null);
    setFormError(null);
    setForm(defaultForm());
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) {
        await api.updateCurrencyExchangeRate(editingId, {
          exchange_rate: form.exchange_rate,
          effective_date: form.effective_date,
          source: form.source,
          is_active: true,
        });
      } else {
        await api.createCurrencyExchangeRate(form);
      }
      closeDrawer();
      await load();
    } catch (err) {
      logApiError("AccountsCurrencyPage.submit", err);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: CurrencyExchangeRateResponse) {
    setEditingId(r.id);
    setFormError(null);
    setForm({
      from_currency: r.from_currency,
      to_currency: r.to_currency,
      exchange_rate: String(r.exchange_rate),
      effective_date: r.effective_date.slice(0, 10),
      source: r.source ?? "manual",
    });
    setDrawerOpen(true);
  }

  async function removeRate(id: number) {
    if (!(await confirm({ title: "Delete this exchange rate row?", danger: true }))) return;
    try {
      await api.deleteCurrencyExchangeRate(id);
      if (editingId === id) closeDrawer();
      await load();
    } catch (e) {
      logApiError("AccountsCurrencyPage.deleteCurrencyExchangeRate", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Multi-Currency"
        description="Exchange rate maintenance and FX revaluation preview."
        actions={
          <Link to="/app/finance/fx-receipts" className="text-sm font-medium text-brand-primary hover:underline">
            FX receipts →
          </Link>
        }
      />

      <div className={listPageFilterBarClass}>
        <input
          type="search"
          aria-label="Search exchange rates"
          placeholder="Search currency pair…"
          className={listPageToolbarInputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add rate
        </button>
      </div>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <div className={listPageTableCardClass}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Exchange Rates</h2>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className={`${listTableBaseClass} min-w-[40rem]`}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={listTableThClass}>Pair</th>
                <th className={listTableThClass}>Rate</th>
                <th className={listTableThClass}>Date</th>
                <th className={listTableThClass}>Source</th>
                <th className={listTableThClass}>Active</th>
                <th className={listTableThClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRates.length === 0 ? (
                <tr>
                  <td className={listPageEmptyClass} colSpan={6}>
                    {rates.length === 0 ? "No exchange rates yet." : "No rates match your search."}
                  </td>
                </tr>
              ) : (
                filteredRates.map((r) => (
                  <tr key={r.id} className={listTableTrClass}>
                    <td className={listTableTdPrimaryClass}>
                      {r.from_currency}/{r.to_currency}
                    </td>
                    <td className={listTableTdClass}>{r.exchange_rate}</td>
                    <td className={listTableTdClass}>{r.effective_date}</td>
                    <td className={listTableTdClass}>{r.source}</td>
                    <td className={listTableTdClass}>{r.is_active ? "Yes" : "No"}</td>
                    <td className={listTableTdClass}>
                      <RowActionsMenu
                        rowId={r.id}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        menuPortal
                        items={[
                          { key: "edit", label: "Edit", onClick: () => startEdit(r) },
                          { key: "delete", label: "Delete", danger: true, onClick: () => void removeRate(r.id) },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-text-muted">
          Showing {filteredRates.length} of {rates.length} rate{rates.length === 1 ? "" : "s"}
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
            <div className="max-h-[24rem] overflow-auto">
              <table className={`${listTableBaseClass} min-w-[40rem]`}>
                <thead className={listTableTheadClass}>
                  <tr>
                    <th className={listTableThClass}>Receipt</th>
                    <th className={listTableThClass}>Currency</th>
                    <th className={listTableThClass}>FC</th>
                    <th className={listTableThClass}>Old Base</th>
                    <th className={listTableThClass}>New Base</th>
                    <th className={listTableThClass}>Gain/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {reval.rows.map((r) => (
                    <tr key={r.receipt_id} className={listTableTrClass}>
                      <td className={listTableTdClass}>{r.receipt_no}</td>
                      <td className={listTableTdClass}>{r.currency}</td>
                      <td className={listTableTdClass}>{r.fc_amount.toLocaleString()}</td>
                      <td className={listTableTdClass}>{r.old_base_amount.toLocaleString()}</td>
                      <td className={listTableTdClass}>{r.new_base_amount.toLocaleString()}</td>
                      <td className={listTableTdClass}>{r.gain_loss.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      <FinanceFormDrawer
        open={drawerOpen}
        title={editingId ? "Edit exchange rate" : "Add exchange rate"}
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel={editingId ? "Save rate" : "Add rate"}
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Exchange rate">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="fx-from">
              From currency
            </label>
            <input
              id="fx-from"
              className={`${fieldClass}${editingId ? " bg-surface-subtle" : ""}`}
              readOnly={!!editingId}
              value={form.from_currency}
              onChange={(e) => setForm((p) => ({ ...p, from_currency: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="fx-to">
              To currency
            </label>
            <input
              id="fx-to"
              className={`${fieldClass}${editingId ? " bg-surface-subtle" : ""}`}
              readOnly={!!editingId}
              value={form.to_currency}
              onChange={(e) => setForm((p) => ({ ...p, to_currency: e.target.value.toUpperCase() }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="fx-rate">
            Exchange rate
          </label>
          <input
            id="fx-rate"
            className={fieldClass}
            value={form.exchange_rate}
            onChange={(e) => setForm((p) => ({ ...p, exchange_rate: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="fx-date">
            Effective date
          </label>
          <input
            id="fx-date"
            type="date"
            className={fieldClass}
            value={form.effective_date}
            onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="fx-source">
            Source
          </label>
          <input
            id="fx-source"
            className={fieldClass}
            placeholder="Source"
            value={form.source ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
          />
        </div>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
