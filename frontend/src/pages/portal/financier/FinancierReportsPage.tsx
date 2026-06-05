const REPORTS: {
  key: string;
  title: string;
  description: string;
}[] = [
  {
    key: "lender_pack",
    title: "Lender pack",
    description: "Consolidated export of key credit and movement signals for your files (when enabled).",
  },
  {
    key: "btb_utilization",
    title: "BTB utilization",
    description: "Master contract and BTB utilization snapshot for linked facilities.",
  },
  {
    key: "repayment_schedule",
    title: "Repayment schedule",
    description: "Installment schedule extract for reporting periods.",
  },
  {
    key: "stock_collateral",
    title: "Stock collateral",
    description: "Open PO / receipt positions related to collateral chains.",
  },
];

export function FinancierReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Reports</h1>
        <p className="mt-1 text-xs text-text-muted">
          Pack exports are coming in a later release. Use dashboard, order book, pipeline, goods movement, and snapshots
          for live reporting today.
        </p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Report file downloads are not enabled for go-live v1. Your financier users can rely on the portal screens listed
        in the sidebar until exports ship.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="flex flex-col rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{r.title}</h2>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                Coming soon
              </span>
            </div>
            <p className="mt-2 flex-1 text-xs text-text-muted">{r.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
