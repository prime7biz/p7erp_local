import { formatMoney, toSafeNumber } from "../mappers/quotationNumeric";

interface CostBreakdownCardProps {
  currency: string;
  total: number;
  rows: Array<{ label: string; value: number | string | null | undefined }>;
}

export function CostBreakdownCard({ currency, total, rows }: CostBreakdownCardProps) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print-card">
      <h3 className="text-xl font-bold text-gray-900">Cost Breakdown</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const value = toSafeNumber(row.value);
          const width = Math.max(6, (value / safeTotal) * 100);
          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-gray-700">{row.label}</span>
                <span className="font-semibold text-gray-900">
                  {formatMoney(value)} {currency}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(width, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
