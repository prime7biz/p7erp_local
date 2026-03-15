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
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-2xl font-semibold text-gray-900">{total}</p>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Vendors</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
        <p className="text-2xl font-semibold text-emerald-700">{active}</p>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-2xl font-semibold text-gray-600">{inactive}</p>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Inactive</p>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
        <p className="text-2xl font-semibold text-blue-700">{ledgerLinked}</p>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ledger Linked</p>
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
        <p className="text-2xl font-semibold text-violet-700">{foreignCurrency}</p>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Foreign Currency</p>
      </div>
    </div>
  );
}
