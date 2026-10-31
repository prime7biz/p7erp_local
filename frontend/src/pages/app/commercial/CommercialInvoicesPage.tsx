import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText } from "lucide-react";
import { api, type CommercialInvoiceRow } from "@/api/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { logApiError } from "@/utils/logApiError";

export function CommercialInvoicesPage() {
  const [searchParams] = useSearchParams();
  const orderIdFilter = Number(searchParams.get("order_id") || 0) || null;
  const [items, setItems] = useState<CommercialInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listCommercialInvoices({
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page: 1,
        page_size: 200,
      });
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      logApiError("CommercialInvoicesPage.load", e);
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDocClick = () => setOpenActionsId(null);
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const filtered = items.filter((row) => {
    if (orderIdFilter) {
      const lineMatch = (row.lines || []).some((ln) => Number((ln as { order_id?: number }).order_id) === orderIdFilter);
      if (row.primary_order_id !== orderIdFilter && !lineMatch) return false;
    }
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return (row.customer_name || "").toLowerCase().includes(q) || String(row.customer_id).includes(q);
  });

  const statusClass = (status: string | undefined) => {
    const v = (status || "").toUpperCase();
    if (v === "DRAFT") return "bg-status-warning-subtle text-status-warning-foreground";
    if (v === "ISSUED") return "bg-status-success-subtle text-status-success-foreground";
    if (v === "CANCELLED") return "bg-status-danger-subtle text-status-danger-foreground";
    return "bg-surface-subtle text-text-secondary";
  };

  const handleIssue = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      await api.issueCommercialInvoice(id);
      await load();
    } catch (e) {
      logApiError("CommercialInvoicesPage.issue", e);
      setError(e instanceof Error ? e.message : "Issue failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm("Cancel this issued commercial invoice?")) return;
    setBusyId(id);
    setError("");
    try {
      await api.cancelCommercialInvoice(id);
      await load();
    } catch (e) {
      logApiError("CommercialInvoicesPage.cancel", e);
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Commercial Invoices</h1>
        <p className="text-sm text-text-muted">
          Sales invoices created from posted delivery challans. Create from a challan detail page, then Issue to
          raise a draft AR voucher.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">DRAFT</option>
          <option value="ISSUED">ISSUED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
          title="To date"
        />
        <input
          type="search"
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search customer…"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      {!loading && filtered.length === 0 && !error ? (
        <EmptyState
          headline="No commercial invoices yet"
          description="Open a posted delivery challan and create an invoice from there."
          icon={FileText}
          ctaLabel="Open delivery challans"
          ctaHref="/app/inventory/delivery-challans"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-text-muted">
                    Loading…
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const st = (row.status || "").toUpperCase();
                  return (
                    <tr key={row.id} className="border-b border-border-subtle/70">
                      <td className="px-3 py-2 font-medium text-text-primary">{row.invoice_code}</td>
                      <td className="px-3 py-2 text-text-secondary">{row.customer_name || `#${row.customer_id}`}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {row.primary_order_code || (row.primary_order_id ? `#${row.primary_order_id}` : "—")}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {row.currency || ""}{" "}
                        {Number(row.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}>
                          {row.status}
                          {row.price_review_required ? " · price review" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {row.issued_at ? row.issued_at.slice(0, 10) : row.invoice_date ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId((prev) => (prev === row.id ? null : row.id));
                            }}
                            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Actions
                          </button>
                          {openActionsId === row.id ? (
                            <div
                              className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                to={`/app/commercial/invoices/${row.id}`}
                                onClick={() => setOpenActionsId(null)}
                                className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                View
                              </Link>
                              {st === "DRAFT" ? (
                                <button
                                  type="button"
                                  disabled={busyId === row.id || row.price_review_required}
                                  onClick={() => {
                                    setOpenActionsId(null);
                                    void handleIssue(row.id);
                                  }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
                                >
                                  Issue
                                </button>
                              ) : null}
                              {st === "ISSUED" ? (
                                <button
                                  type="button"
                                  disabled={busyId === row.id}
                                  onClick={() => {
                                    setOpenActionsId(null);
                                    void handleCancel(row.id);
                                  }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger-foreground hover:bg-status-danger-subtle disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
