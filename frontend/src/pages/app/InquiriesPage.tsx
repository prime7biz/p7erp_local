import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type CustomerResponse, type InquiryResponse } from "@/api/client";
import {
  canConvertInquiryToQuotation,
  humanizeStatus,
  INQUIRY_STATUS_FILTER_OPTIONS,
} from "@/features/merch/workflow";

const statusClass = (status: string) => {
  const value = status.toUpperCase();
  if (value === "CONVERTED") return "bg-status-success-subtle text-status-success-foreground";
  if (value === "LOST" || value === "CANCELLED") return "bg-status-danger-subtle text-status-danger-foreground";
  if (value === "SUBMITTED") return "bg-status-info-subtle text-status-info-foreground";
  return "bg-status-neutral-subtle text-status-neutral-foreground";
};

export function InquiriesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InquiryResponse[]>([]);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [inqs, custs] = await Promise.all([
        api.listInquiries({
          search,
          status: statusFilter || undefined,
          department: departmentFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        api.listCustomers(),
      ]);
      setItems(inqs);
      setCustomers(custs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => items, [items]);

  const customerName = (id: number) =>
    customers.find((c) => c.id === id)?.name ?? `#${id}`;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, departmentFilter, page]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inquiries</h1>
          <p className="text-text-muted text-sm mt-0.5">
            Manage buyer inquiries before they become quotations and confirmed orders.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            placeholder="Search by code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-48 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="">All statuses</option>
            {INQUIRY_STATUS_FILTER_OPTIONS.map((statusValue) => (
              <option key={statusValue} value={statusValue}>
                {humanizeStatus(statusValue)}
              </option>
            ))}
          </select>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="">All departments</option>
            <option value="Infant">Infant</option>
            <option value="Kids">Kids</option>
            <option value="Boys">Boys</option>
            <option value="Girls">Girls</option>
            <option value="Men">Men</option>
            <option value="Ladies">Ladies</option>
            <option value="Knit">Knit</option>
            <option value="Fleece">Fleece</option>
          </select>
          <button
            type="button"
            onClick={() => navigate("/app/inquiries/new")}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            New Inquiry
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-text-muted">Loading inquiries...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No inquiries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                <tr>
                  <th className="py-2.5 px-4 w-24 whitespace-nowrap">Code</th>
                  <th className="py-2.5 px-4 min-w-[120px]">Customer</th>
                  <th className="py-2.5 px-4 min-w-[160px]">Style</th>
                  <th className="py-2.5 px-4 min-w-[100px] whitespace-nowrap">Intermediary</th>
                  <th className="py-2.5 px-4 w-20 whitespace-nowrap">Shipping</th>
                  <th className="py-2.5 px-4 text-right w-20 whitespace-nowrap">Qty</th>
                  <th className="py-2.5 px-4 min-w-[140px] whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-4 text-right w-24 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((inq) => (
                  <tr key={inq.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/70">
                    <td className="py-2.5 px-4 font-medium text-text-primary whitespace-nowrap">
                      <Link to={`/app/inquiries/${inq.id}`} className="text-status-info hover:underline">
                        {inq.inquiry_code}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={customerName(inq.customer_id)}>
                      {customerName(inq.customer_id)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 min-w-0">
                        {inq.style_image_url ? (
                          <img
                            src={inq.style_image_url}
                            alt={inq.style_name ?? inq.style_ref ?? "style"}
                            className="h-9 w-9 shrink-0 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="h-9 w-9 shrink-0 rounded bg-surface-subtle border border-border" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-text-primary truncate" title={inq.style_name ?? inq.style_ref ?? undefined}>
                            {inq.style_name ?? inq.style_ref ?? "—"}
                          </div>
                          <div className="text-xs text-text-muted whitespace-nowrap truncate" title={inq.style_ref && inq.style_name && inq.style_ref !== inq.style_name ? inq.style_ref : inq.department ?? undefined}>
                            {inq.style_ref && inq.style_name && inq.style_ref !== inq.style_name
                              ? inq.style_ref
                              : inq.department ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={inq.intermediary_name ?? undefined}>
                      {inq.intermediary_name ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={inq.shipping_term ?? undefined}>
                      {inq.shipping_term ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right text-text-secondary whitespace-nowrap">
                      {inq.quantity != null ? inq.quantity.toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary overflow-hidden text-ellipsis" title={[inq.status, inq.is_converted_to_quotation ? "Converted to quotation" : null].filter(Boolean).join(" · ")}>
                      <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap min-w-0">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(inq.status)}`}>
                          {inq.status}
                        </span>
                        {inq.is_converted_to_quotation && (
                          <span className="inline-flex rounded-full bg-status-info-subtle px-2 py-0.5 text-xs font-medium text-status-info-foreground">
                            Converted to quotation
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === inq.id ? null : inq.id))}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === inq.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <Link
                              to={`/app/inquiries/${inq.id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null);
                                navigate(`/app/inquiries/${inq.id}/edit`);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Edit
                            </button>
                            <Link
                              to={`/app/inquiries/${inq.id}/print`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Print
                            </Link>
                            {inq.is_converted_to_quotation ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Already converted
                              </div>
                            ) : !canConvertInquiryToQuotation(inq.status) ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Submit first
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenActionsId(null);
                                  try {
                                    setError("");
                                    const quotation = await api.convertInquiryToQuotation(inq.id, {
                                      profit_percentage: 15,
                                    });
                                    await load();
                                    alert(`Quotation ${quotation.quotation_code} created from inquiry.`);
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Convert to quotation failed");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-info-foreground hover:bg-status-info-subtle"
                              >
                                To quotation
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenActionsId(null);
                                if (!window.confirm("Delete this inquiry?")) return;
                                try {
                                  setError("");
                                  await api.deleteInquiry(inq.id);
                                  await load();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "Delete failed");
                                }
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-lg border border-border-strong px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          disabled={items.length < pageSize}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-border-strong px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

