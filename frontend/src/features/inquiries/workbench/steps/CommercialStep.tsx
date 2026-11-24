import type { CurrencyMasterResponse, InquiryCreate } from "@/api/client";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";

const INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0";

type Props = {
  form: InquiryCreate;
  onPatch: (patch: Partial<InquiryCreate>) => void;
  currencies: CurrencyMasterResponse[];
  fetchingRates: boolean;
  rateSource: "" | "live" | "fallback";
  onSyncExchangeRate: () => void;
};

export function CommercialStep({
  form,
  onPatch,
  currencies,
  fetchingRates,
  rateSource,
  onSyncExchangeRate,
}: Props) {
  const currencyOptions =
    currencies.length > 0 ? currencies.map((c) => c.code) : ["USD", "BDT", "EUR", "GBP", "JPY"];

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">Step 3 — Commercial</h2>
      <p className="text-xs text-text-muted">
        Quantity, target price and FX are used when you convert this inquiry to a quotation.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Quantity</span>
          <input
            type="number"
            min={0}
            value={form.quantity ?? ""}
            onChange={(e) =>
              onPatch({ quantity: e.target.value === "" ? undefined : Number(e.target.value) })
            }
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Target price</span>
          <input
            type="text"
            inputMode="decimal"
            value={form.target_price ?? ""}
            onChange={(e) => onPatch({ target_price: e.target.value })}
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Target currency</span>
          <select
            value={form.target_price_currency ?? "USD"}
            onChange={(e) => onPatch({ target_price_currency: e.target.value })}
            className={INPUT}
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Document currency</span>
          <select
            value={form.currency ?? "USD"}
            onChange={(e) => onPatch({ currency: e.target.value })}
            className={INPUT}
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Exchange rate (to BDT)</span>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={form.exchange_rate ?? ""}
              onChange={(e) => onPatch({ exchange_rate: e.target.value })}
              className={INPUT}
            />
            <button
              type="button"
              onClick={onSyncExchangeRate}
              disabled={fetchingRates}
              className="shrink-0 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
            >
              {fetchingRates ? "…" : "Sync FX"}
            </button>
          </div>
          {rateSource ? (
            <p className="mt-1 text-xs text-text-muted">
              Rate source: {rateSource === "live" ? "live" : "fallback"}
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Expected delivery</span>
          <input
            type="date"
            value={form.expected_delivery_date ?? ""}
            onChange={(e) => onPatch({ expected_delivery_date: e.target.value })}
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Shipping term</span>
          <select
            value={form.shipping_term ?? ""}
            onChange={(e) => onPatch({ shipping_term: e.target.value })}
            className={INPUT}
          >
            <option value="">—</option>
            {withLegacyOption(form.shipping_term, SHIPPING_TERM_OPTIONS).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Commission mode</span>
          <select
            value={form.commission_mode ?? ""}
            onChange={(e) => onPatch({ commission_mode: e.target.value })}
            className={INPUT}
          >
            <option value="">—</option>
            {withLegacyOption(form.commission_mode, COMMISSION_MODE_OPTIONS).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Commission type</span>
          <select
            value={form.commission_type ?? ""}
            onChange={(e) => onPatch({ commission_type: e.target.value })}
            className={INPUT}
          >
            <option value="">—</option>
            {withLegacyOption(form.commission_type, COMMISSION_TYPE_OPTIONS).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">Commission value</span>
          <input
            type="text"
            inputMode="decimal"
            value={form.commission_value ?? ""}
            onChange={(e) => onPatch({ commission_value: e.target.value })}
            className={INPUT}
          />
        </label>
      </div>
    </div>
  );
}
