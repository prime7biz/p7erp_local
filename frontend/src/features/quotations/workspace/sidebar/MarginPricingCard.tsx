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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print-card">
      <h3 className="text-xl font-bold text-gray-900">Margin & Final Pricing</h3>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Profit Margin (%)</div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-semibold text-gray-900">
            {profitPercentage ?? "0"}%
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Agency Commission (%)</div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-semibold text-gray-900">
            {commissionValue ?? "0"}%
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-sm font-semibold text-gray-700">Net FOB Price</div>
        <div className="mt-1 text-4xl font-bold text-orange-600">
          {formatMoney(net)} <span className="text-base text-gray-700">{currency}</span>
        </div>
        <div className="text-sm text-gray-500">Unit of Measure: {uom}</div>
      </div>
    </section>
  );
}
