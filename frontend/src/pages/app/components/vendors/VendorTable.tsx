import type { VendorResponse } from "@/api/client";

interface VendorTableProps {
  items: VendorResponse[];
  onRowClick: (v: VendorResponse) => void;
}

export function VendorTable({ items, onRowClick }: VendorTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Code</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Name</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Contact</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Email / Phone</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Currency</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Ledger</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                No vendors found. Add one to get started.
              </td>
            </tr>
          )}
          {items.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="cursor-pointer hover:bg-gray-50/80 transition-colors"
            >
              <td className="px-4 py-2.5 font-medium text-gray-900">{row.vendor_code}</td>
              <td className="px-4 py-2.5 text-gray-800">{row.name}</td>
              <td className="px-4 py-2.5 text-gray-600">{row.contact_person ?? "—"}</td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.email ?? "—"} {row.phone ? ` · ${row.phone}` : ""}
              </td>
              <td className="px-4 py-2.5 text-gray-600">{row.default_currency ?? "—"}</td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.ledger_id ? `#${row.ledger_id}` : "—"}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={
                    row.is_active
                      ? "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700"
                      : "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500"
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
