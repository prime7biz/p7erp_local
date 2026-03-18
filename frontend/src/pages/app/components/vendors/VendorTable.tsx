import type { VendorResponse } from "@/api/client";

interface VendorTableProps {
  items: VendorResponse[];
  onRowClick: (v: VendorResponse) => void;
}

export function VendorTable({ items, onRowClick }: VendorTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="bg-surface-subtle border-b border-border">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Code</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Name</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Contact</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Email / Phone</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Currency</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Ledger</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-text-muted">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-text-muted">
                No vendors found. Add one to get started.
              </td>
            </tr>
          )}
          {items.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="cursor-pointer hover:bg-surface-subtle transition-colors"
            >
              <td className="px-4 py-2.5 font-medium text-text-primary">{row.vendor_code}</td>
              <td className="px-4 py-2.5 text-text-primary">{row.name}</td>
              <td className="px-4 py-2.5 text-text-secondary">{row.contact_person ?? "—"}</td>
              <td className="px-4 py-2.5 text-text-secondary">
                {row.email ?? "—"} {row.phone ? ` · ${row.phone}` : ""}
              </td>
              <td className="px-4 py-2.5 text-text-secondary">{row.default_currency ?? "—"}</td>
              <td className="px-4 py-2.5 text-text-secondary">
                {row.ledger_id ? `#${row.ledger_id}` : "—"}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={
                    row.is_active
                      ? "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground"
                      : "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-neutral-subtle text-status-neutral-foreground"
                  }
                >
                  {row.is_active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
