import type { VendorResponse } from "@/api/client";

interface VendorCardsProps {
  items: VendorResponse[];
  onCardClick: (v: VendorResponse) => void;
}

export function VendorCards({ items, onCardClick }: VendorCardsProps) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-text-muted">
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
          className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm cursor-pointer hover:shadow-md hover:border-border-strong transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text-primary truncate">{v.name}</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">{v.vendor_code}</p>
            </div>
            <span
              className={
                v.is_active
                  ? "shrink-0 inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground"
                  : "shrink-0 inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-neutral-subtle text-status-neutral-foreground"
              }
            >
              {v.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {(v.contact_person || v.email || v.phone) && (
            <div className="mt-2 pt-2 border-t border-border-subtle text-xs text-text-secondary space-y-0.5">
              {v.contact_person && <p>{v.contact_person}</p>}
              {v.email && <p className="truncate">{v.email}</p>}
              {v.phone && <p>{v.phone}</p>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {v.default_currency && (
              <span className="inline-flex rounded-md bg-status-info-subtle px-2 py-0.5 text-[11px] font-medium text-status-info-foreground">
                {v.default_currency}
              </span>
            )}
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
                v.ledger_id ? "bg-status-info-subtle text-status-info-foreground" : "bg-status-neutral-subtle text-status-neutral-foreground"
              }`}
            >
              {v.ledger_id ? `Ledger #${v.ledger_id}` : "No Ledger"}
            </span>
            {v.vendor_type && (
              <span className="inline-flex rounded-md bg-status-warning-subtle px-2 py-0.5 text-[11px] font-medium text-status-warning-foreground">
                {v.vendor_type}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
