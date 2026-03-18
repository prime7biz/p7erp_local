import { formatMoney, toSafeNumber } from "../mappers/quotationNumeric";

interface MarginPricingCardProps {
  profitPercentage: string | null | undefined;
  commissionValue: string | null | undefined;
  netFobPrice: string | null | undefined;
  uom: string;
  currency: string;
}

export function MarginPricingCard({
  profitPercentage,
  commissionValue,
  netFobPrice,
  uom,
  currency,
}: MarginPricingCardProps) {
  const net = toSafeNumber(netFobPrice);
  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
      <h3 className="text-xl font-bold text-text-primary">Margin & Final Pricing</h3>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Profit Margin (%)</div>
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 font-semibold text-text-primary">
            {toSafeNumber(profitPercentage).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Agency Commission (%)</div>
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 font-semibold text-text-primary">
            {toSafeNumber(commissionValue).toFixed(1)}%
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-border-subtle pt-3">
        <div className="text-sm font-semibold text-text-secondary">Net FOB Price</div>
        <div className="mt-1 text-4xl font-bold text-brand-primary">
          {formatMoney(net)} <span className="text-base text-text-secondary">{currency}</span>
        </div>
        <div className="text-sm text-text-muted">Unit of Measure: {uom}</div>
      </div>
    </section>
  );
}
