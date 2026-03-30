import type { VendorResponse } from "@/api/client";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import {
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";

interface VendorTableProps {
  items: VendorResponse[];
  onRowClick: (v: VendorResponse) => void;
}

export function VendorTable({ items, onRowClick }: VendorTableProps) {
  return (
    <ResponsiveTableContainer>
      <table className={cn(listTableBaseClass, "min-w-[640px]")}>
        <thead className={listTableTheadClass}>
          <tr>
            <th className={listTableThClass}>Code</th>
            <th className={listTableThClass}>Name</th>
            <th className={listTableThClass}>Contact</th>
            <th className={listTableThClass}>Email / Phone</th>
            <th className={listTableThClass}>Currency</th>
            <th className={listTableThClass}>Ledger</th>
            <th className={listTableThClass}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className={cn(listTableTdClass, "py-10 text-center")}>
                No vendors found. Add one to get started.
              </td>
            </tr>
          )}
          {items.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className={cn(listTableTrClass, "cursor-pointer transition-colors")}
            >
              <td className={listTableTdPrimaryClass}>{row.vendor_code}</td>
              <td className={cn(listTableTdClass, "text-text-primary")}>{row.name}</td>
              <td className={listTableTdClass}>{row.contact_person ?? "—"}</td>
              <td className={listTableTdClass}>
                {row.email ?? "—"} {row.phone ? ` · ${row.phone}` : ""}
              </td>
              <td className={listTableTdClass}>{row.default_currency ?? "—"}</td>
              <td className={listTableTdClass}>{row.ledger_id ? `#${row.ledger_id}` : "—"}</td>
              <td className={listTableTdClass}>
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
    </ResponsiveTableContainer>
  );
}
