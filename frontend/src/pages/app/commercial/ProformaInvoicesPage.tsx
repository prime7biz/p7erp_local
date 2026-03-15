import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus, Printer } from "lucide-react";
import { api, type ProformaInvoiceRow, type OrderResponse } from "@/api/client";

export function ProformaInvoicesPage() {
  const [items, setItems] = useState<ProformaInvoiceRow[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const orderCodeMap = useMemo(
    () => new Map<number, string>(orders.map((o) => [o.id, o.order_code])),
    [orders]
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [invoices, ordersList] = await Promise.all([
        api.listProformaInvoices(),
        api.listOrders({ limit: 500, offset: 0 }),
      ]);
      setItems(Array.isArray(invoices) ? invoices : []);
      setOrders(ordersList);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load proforma invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const orderCodesDisplay = (row: ProformaInvoiceRow) => {
    const ids = row.order_ids ?? (row.order_id != null ? [row.order_id] : []);
    if (ids.length === 0) return "—";
    return ids.map((id) => orderCodeMap.get(id) ?? `#${id}`).join(", ");
  };

  const statusClass = (status: string | undefined) => {
    if (!status) return "bg-slate-100 text-slate-600";
    const v = status.toUpperCase();
    if (v === "DRAFT") return "bg-amber-100 text-amber-800";
    if (v === "ISSUED" || v === "FINALIZED") return "bg-emerald-100 text-emerald-800";
    return "bg-slate-100 text-slate-600";
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this proforma invoice?")) return;
    setDeletingId(id);
    try {
      await api.deleteProformaInvoice(id);
      setOpenActionsId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Proforma Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            List of proforma invoices for commercial and export documentation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/app/commercial/proforma-invoices/new"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create Proforma Invoice
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            <span className="text-sm">Loading proforma invoices…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="rounded-full bg-slate-100 p-4">
              <FileText className="h-10 w-10 text-slate-400" aria-hidden />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-slate-800">No proforma invoices yet</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Create your first proforma invoice to generate commercial and export documentation for orders.
              </p>
            </div>
            <Link
              to="/app/commercial/proforma-invoices/new"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create Proforma Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Reference
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Direction
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Currency
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Orders
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Master Contract
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Invoice date
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Created
                  </th>
                  <th scope="col" className="relative w-28 px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-slate-50/80 ${index % 2 === 1 ? "bg-slate-50/50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                      {row.reference ?? row.invoice_number ?? `#${row.id}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>
                        {row.status ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        (row.direction || "").toUpperCase() === "IMPORT"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}>
                        {(row.direction || "EXPORT").toUpperCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700 tabular-nums">
                      {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.currency ?? "—"}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-700" title={orderCodesDisplay(row)}>
                      {orderCodesDisplay(row)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.master_contract_id ? `#${row.master_contract_id}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.invoice_date ? new Date(row.invoice_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="relative whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/app/commercial/proforma-invoices/${row.id}/print`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          title="Print"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden />
                          Print
                        </Link>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            aria-expanded={openActionsId === row.id}
                            aria-haspopup="true"
                          >
                            Actions
                          </button>
                          {openActionsId === row.id && (
                            <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                              <Link
                                to={`/app/commercial/proforma-invoices/${row.id}/edit`}
                                onClick={() => setOpenActionsId(null)}
                                className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </Link>
                              {(row.status ?? "").toUpperCase() === "DRAFT" && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(row.id)}
                                  disabled={deletingId === row.id}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  {deletingId === row.id ? "Deleting…" : "Delete"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
