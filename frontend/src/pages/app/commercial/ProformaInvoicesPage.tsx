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
    if (!status) return "bg-surface-subtle text-text-secondary";
    const v = status.toUpperCase();
    if (v === "DRAFT") return "bg-status-warning-subtle text-status-warning-foreground";
    if (v === "ISSUED" || v === "FINALIZED") return "bg-status-success-subtle text-status-success-foreground";
    return "bg-surface-subtle text-text-secondary";
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
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Proforma Invoices</h1>
          <p className="mt-1 text-sm text-text-muted">
            List of proforma invoices for commercial and export documentation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/app/commercial/proforma-invoices/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow-sm transition hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create Proforma Invoice
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-indigo-600" />
            <span className="text-sm">Loading proforma invoices…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="rounded-full bg-surface-subtle p-4">
              <FileText className="h-10 w-10 text-text-muted" aria-hidden />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-text-primary">No proforma invoices yet</h2>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Create your first proforma invoice to generate commercial and export documentation for orders.
              </p>
            </div>
            <Link
              to="/app/commercial/proforma-invoices/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow-sm hover:bg-brand-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create Proforma Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Reference
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Direction
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Currency
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Orders
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Master Contract
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Invoice date
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Created
                  </th>
                  <th scope="col" className="relative w-28 px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-surface-raised">
                {items.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-surface-subtle/80 ${index % 2 === 1 ? "bg-surface-subtle/50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">
                      {row.reference ?? row.invoice_number ?? `#${row.id}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>
                        {row.status ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        (row.direction || "").toUpperCase() === "IMPORT"
                          ? "bg-status-info-subtle text-status-info-foreground"
                          : "bg-brand-primary/20 text-brand-primary"
                      }`}>
                        {(row.direction || "EXPORT").toUpperCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-text-secondary tabular-nums">
                      {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{row.currency ?? "—"}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-text-secondary" title={orderCodesDisplay(row)}>
                      {orderCodesDisplay(row)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {row.master_contract_id ? `#${row.master_contract_id}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {row.invoice_date ? new Date(row.invoice_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="relative whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/app/commercial/proforma-invoices/${row.id}/print`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-secondary shadow-sm hover:bg-surface-subtle"
                          title="Print"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden />
                          Print
                        </Link>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            aria-expanded={openActionsId === row.id}
                            aria-haspopup="true"
                          >
                            Actions
                          </button>
                          {openActionsId === row.id && (
                            <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                              <Link
                                to={`/app/commercial/proforma-invoices/${row.id}/edit`}
                                onClick={() => setOpenActionsId(null)}
                                className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Edit
                              </Link>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    setError("");
                                    const created = await api.createTradeCase({
                                      direction: (row.direction || "EXPORT").toUpperCase(),
                                      reference: `TC-${row.reference || row.id}`,
                                      status: "DRAFT",
                                      current_stage: "DRAFT",
                                      proforma_invoice_id: row.id,
                                      order_id: row.order_ids?.[0] ?? row.order_id,
                                      vendor_id: row.vendor_id ?? undefined,
                                    });
                                    setOpenActionsId(null);
                                    window.location.href = `/app/trade/cases/${created.id}`;
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Failed to create trade case");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Create Trade Case
                              </button>
                              {(row.status ?? "").toUpperCase() === "DRAFT" && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(row.id)}
                                  disabled={deletingId === row.id}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle disabled:opacity-50"
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
