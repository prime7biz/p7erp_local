interface VendorKpiCardsProps {
  total: number;
  active: number;
  inactive: number;
  ledgerLinked: number;
  foreignCurrency: number;
}

export function VendorKpiCards({
  total,
  active,
  inactive,
  ledgerLinked,
  foreignCurrency,
}: VendorKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <p className="text-2xl font-semibold text-text-primary">{total}</p>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Total Vendors</p>
      </div>
      <div className="rounded-xl border border-status-success/20 bg-status-success-subtle p-4 shadow-sm">
        <p className="text-2xl font-semibold text-status-success-foreground">{active}</p>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Active</p>
      </div>
      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <p className="text-2xl font-semibold text-text-secondary">{inactive}</p>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Inactive</p>
      </div>
      <div className="rounded-xl border border-status-info/20 bg-status-info-subtle p-4 shadow-sm">
        <p className="text-2xl font-semibold text-status-info-foreground">{ledgerLinked}</p>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Ledger Linked</p>
      </div>
      <div className="rounded-xl border border-status-info/20 bg-status-info-subtle p-4 shadow-sm">
        <p className="text-2xl font-semibold text-status-info-foreground">{foreignCurrency}</p>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Foreign Currency</p>
      </div>
    </div>
  );
}
