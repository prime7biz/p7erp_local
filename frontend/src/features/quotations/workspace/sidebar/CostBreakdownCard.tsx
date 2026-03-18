import { formatMoney, toSafeNumber } from "../mappers/quotationNumeric";

interface CostBreakdownCardProps {
  currency: string;
  total: number;
  rows: Array<{ label: string; value: number | string | null | undefined }>;
}

export function CostBreakdownCard({ currency, total, rows }: CostBreakdownCardProps) {
  const percentBase = total > 0 ? total : rows.reduce((acc, row) => acc + toSafeNumber(row.value), 0) || 1;
  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
      <h3 className="text-xl font-bold text-text-primary">Cost Breakdown</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const value = toSafeNumber(row.value);
          const percentage = (value / percentBase) * 100;
          const width = Math.max(6, percentage);
          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-text-secondary">{row.label}</span>
                <span className="font-semibold text-text-primary">
                  {formatMoney(value)} {currency} ({percentage.toFixed(2)}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-subtle">
                <div className="h-2 rounded-full bg-brand-primary" style={{ width: `${Math.min(width, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
