import { formatMoney, toSafeNumber } from "../mappers/quotationNumeric";

interface CostSummaryCardProps {
  currency: string;
  materialCost: string | null | undefined;
  trimsCost: number;
  laborCost: string | null | undefined;
  washFinishCost: number;
  overheadCost: number;
  totalFobCost: string | null | undefined;
  factoryMarginAmount: number;
  factoryMarginPercent: number;
}

export function CostSummaryCard(props: CostSummaryCardProps) {
  const rows = [
    { label: "Direct Fabric", value: toSafeNumber(props.materialCost) },
    { label: "Trims & Accessories", value: props.trimsCost },
    { label: "Direct Labor (CM)", value: toSafeNumber(props.laborCost) },
    { label: "Washing & Finishing", value: props.washFinishCost },
    { label: "Factory Overheads", value: props.overheadCost },
  ];
  const total = toSafeNumber(props.totalFobCost) || rows.reduce((acc, row) => acc + row.value, 0);

  return (
    <section className="overflow-hidden rounded-2xl bg-surface-inverse text-text-inverse shadow-lg print-card">
      <div className="space-y-3 p-4">
        <h3 className="text-xl font-bold">Cost Summary</h3>
        <div className="space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-text-inverse/80">{row.label}</span>
              <span className="font-semibold">
                {formatMoney(row.value)} {props.currency}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-3">
          <div className="text-xs uppercase tracking-wide text-brand-primary">Total FOB Cost</div>
          <div className="mt-1 text-4xl font-extrabold">
            {formatMoney(total)} <span className="text-base font-semibold">{props.currency}</span>
          </div>
        </div>
      </div>
      <div className="bg-brand-primary px-4 py-3 text-brand-primary-foreground">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider">Factory Margin</span>
          <span className="text-2xl font-bold">
            {formatMoney(props.factoryMarginAmount)} ({props.factoryMarginPercent.toFixed(1)}%)
          </span>
        </div>
      </div>
    </section>
  );
}
