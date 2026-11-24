import { formatMoney, toSafeNumber } from "../mappers/quotationNumeric";

interface MarginPricingCardProps {
  profitPercentage: string | null | undefined;
  /** Actual margin % when manual price is used; otherwise profit_percentage. */
  displayMarginPercent?: number;
  commissionType: string | null | undefined;
  commissionValue: string | null | undefined;
  commissionAmount?: number;
  /** Per-piece quoted price. */
  quotedPricePerPc: string | number | null | undefined;
  /** Order-total quoted value. */
  quotedOrderTotal: string | number | null | undefined;
  /** Per-piece FOB cost (ex-profit). */
  costPerPc: string | number | null | undefined;
  currency: string;
}

export function MarginPricingCard({
  profitPercentage,
  displayMarginPercent,
  commissionType,
  commissionValue,
  commissionAmount,
  quotedPricePerPc,
  quotedOrderTotal,
  costPerPc,
  currency,
}: MarginPricingCardProps) {
  const perPc = toSafeNumber(quotedPricePerPc);
  const orderTotal = toSafeNumber(quotedOrderTotal);
  const costPc = toSafeNumber(costPerPc);
  const marginPct =
    displayMarginPercent != null && Number.isFinite(displayMarginPercent)
      ? displayMarginPercent
      : toSafeNumber(profitPercentage);
  const isFixed = String(commissionType || "").toUpperCase() === "FIXED";
  const commissionLabel = isFixed
    ? `${formatMoney(toSafeNumber(commissionValue))} ${currency}`
    : `${toSafeNumber(commissionValue).toFixed(1)}%`;

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
      <h3 className="text-xl font-bold text-text-primary">Margin & Final Pricing</h3>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Factory Margin (%)
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 font-semibold text-text-primary">
            {marginPct.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Agency Commission {isFixed ? "(fixed)" : "(%)"}
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 font-semibold text-text-primary">
            {commissionLabel}
            {commissionAmount != null && commissionAmount > 0 ? (
              <span className="ml-2 text-xs font-normal text-text-muted">
                (= {formatMoney(commissionAmount)} {currency})
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
        <div>
          <div className="text-sm font-semibold text-text-secondary">FOB Cost / PC</div>
          <div className="mt-0.5 text-xl font-bold text-text-primary">
            {formatMoney(costPc)} <span className="text-sm font-normal text-text-secondary">{currency}</span>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-text-secondary">Quoted Price / PC</div>
          <div className="mt-0.5 text-2xl font-bold text-brand-primary">
            {formatMoney(perPc)} <span className="text-sm font-normal text-text-secondary">{currency}</span>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-text-secondary">Total Quoted Value</div>
          <div className="mt-0.5 text-3xl font-bold text-brand-primary">
            {formatMoney(orderTotal)} <span className="text-base text-text-secondary">{currency}</span>
          </div>
          <div className="text-xs text-text-muted">Order total (all pieces)</div>
        </div>
      </div>
    </section>
  );
}
