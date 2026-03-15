import type { VendorResponse } from "@/api/client";

interface VendorCardsProps {
  items: VendorResponse[];
  onCardClick: (v: VendorResponse) => void;
}

export function VendorCards({ items, onCardClick }: VendorCardsProps) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-gray-500">
        <p className="font-medium">No vendors found</p>
        <p className="text-sm mt-1">Add a vendor to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 p-3">
      {items.map((v) => (
        <div
          key={v.id}
          onClick={() => onCardClick(v)}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{v.name}</p>
              <p className="text-xs font-medium text-gray-500 mt-0.5">{v.vendor_code}</p>
            </div>
            <span
              className={
                v.is_active
                  ? "shrink-0 inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700"
                  : "shrink-0 inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500"
              }
            >
              {v.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {(v.contact_person || v.email || v.phone) && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-0.5">
              {v.contact_person && <p>{v.contact_person}</p>}
              {v.email && <p className="truncate">{v.email}</p>}
              {v.phone && <p>{v.phone}</p>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {v.default_currency && (
              <span className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                {v.default_currency}
              </span>
            )}
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
                v.ledger_id ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {v.ledger_id ? `Ledger #${v.ledger_id}` : "No Ledger"}
            </span>
            {v.vendor_type && (
              <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                {v.vendor_type}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
