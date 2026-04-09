import type { OrderDrivenBomSummary } from "@/api/client";

export function BomSummaryCards({ summary }: { summary: OrderDrivenBomSummary }) {
  const cards: Array<{ label: string; value: string | number }> = [
    { label: "Quoted material cost", value: summary.total_quoted_material_cost.toLocaleString() },
    { label: "BOM material cost", value: summary.total_bom_material_cost.toLocaleString() },
    { label: "Cost variance", value: summary.variance_amount.toLocaleString() },
    { label: "Planned wastage cost", value: summary.planned_wastage_cost.toLocaleString() },
    { label: "Planned process loss cost", value: summary.planned_process_loss_cost.toLocaleString() },
    { label: "Lines pending vendor", value: summary.lines_pending_vendor },
    { label: "Ready for PO", value: summary.lines_ready_for_po },
    { label: "Procurement started", value: summary.lines_procurement_started },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs text-text-muted">{c.label}</div>
          <div className="mt-1 text-lg font-semibold text-text-primary">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
