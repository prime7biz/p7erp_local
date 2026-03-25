import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type QuotationResponse,
  type CustomerResponse,
  type InquiryResponse,
} from "@/api/client";
import { QuotationStatusBadge } from "./quotations/QuotationStatusBadge";
import { QuotationListSkeleton } from "./quotations/QuotationListSkeleton";
import {
  canConvertQuotationToOrder,
  getQuotationWorkflowAction,
  humanizeStatus,
  QUOTATION_STATUS_FILTER_OPTIONS,
} from "@/features/merch/workflow";
import { SecureImage } from "@/components/SecureImage";

export function QuotationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuotationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [inquiries, setInquiries] = useState<InquiryResponse[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [quickFilter, setQuickFilter] = useState<"all" | "has_inquiry" | "has_style_image" | "ready_to_convert">("all");
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [quotes, custs] = await Promise.all([
        api.listQuotations({
          search,
          status: statusFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        api.listCustomers(),
      ]);
      setItems(quotes);
      setCustomers(custs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (quickFilter === "has_inquiry") return items.filter((q) => q.inquiry_id != null);
    if (quickFilter === "has_style_image") return items.filter((q) => Boolean(q.style_image_url));
    if (quickFilter === "ready_to_convert") {
      return items.filter((q) => canConvertQuotationToOrder(q.status) && !q.is_converted_to_order);
    }
    return items;
  }, [items, quickFilter]);

  const customerName = (id: number) =>
    customers.find((c) => c.id === id)?.name ?? `#${id}`;

  const inquiryCode = (id: number | null) =>
    id == null ? "—" : inquiries.find((i) => i.id === id)?.inquiry_code ?? `#${id}`;

  const formatAmount = (amount: unknown) => {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : "—";
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page]);

  useEffect(() => {
    const loadInquiries = async () => {
      try {
        const data = await api.listInquiries({ limit: 200, offset: 0 });
        setInquiries(data);
      } catch {
        // ignore
      }
    };
    loadInquiries();
  }, []);

  const openCreate = () => {
    navigate("/app/quotations/new");
  };

  const approvedCount = filteredItems.filter((q) => q.status === "APPROVED").length;
  const pendingCount = filteredItems.filter((q) => ["DRAFT", "NEW", "SUBMITTED"].includes(q.status)).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Quotations</h1>
          <p className="text-text-muted text-sm mt-0.5">
            Track price quotations generated from inquiries and convert them into sales orders.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by code…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-48 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-40 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="">All statuses</option>
            {QUOTATION_STATUS_FILTER_OPTIONS.map((statusValue) => (
              <option key={statusValue} value={statusValue}>
                {humanizeStatus(statusValue)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setQuickFilter("all");
              setPage(1);
            }}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Clear filters
          </button>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            New quotation
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All" },
          { key: "has_inquiry", label: "Has inquiry" },
          { key: "has_style_image", label: "Has style image" },
          { key: "ready_to_convert", label: "Ready to convert" },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setQuickFilter(chip.key as typeof quickFilter)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              quickFilter === chip.key ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-border text-text-secondary"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Total on page</div>
          <div className="text-xl font-bold text-text-primary">{filteredItems.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Approved</div>
          <div className="text-xl font-bold text-status-success-foreground">{approvedCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Needs action</div>
          <div className="text-xl font-bold text-status-warning-foreground">{pendingCount}</div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        {loading ? (
          <QuotationListSkeleton />
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-text-muted space-y-3">
            <div>No quotations found for current filters.</div>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground"
              >
                New quotation
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setQuickFilter("all");
                }}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2.5 px-4 w-24 whitespace-nowrap">Code</th>
                <th className="py-2.5 px-4 min-w-[120px]">Customer</th>
                <th className="py-2.5 px-4 w-24 whitespace-nowrap">Inquiry</th>
                <th className="py-2.5 px-4 min-w-[140px]">Style</th>
                <th className="py-2.5 px-4 min-w-[100px] whitespace-nowrap">Intermediary</th>
                <th className="py-2.5 px-4 w-20 whitespace-nowrap">Shipping</th>
                <th className="py-2.5 px-4 min-w-[120px] whitespace-nowrap">Commission</th>
                <th className="py-2.5 px-4 text-right w-20 whitespace-nowrap">Qty</th>
                <th className="py-2.5 px-4 text-right min-w-[90px] whitespace-nowrap">Amount</th>
                <th className="py-2.5 px-4 text-right w-20 whitespace-nowrap">Profit %</th>
                <th className="py-2.5 px-4 min-w-[140px] whitespace-nowrap">Status</th>
                <th className="py-2.5 px-4 w-24 whitespace-nowrap">Created</th>
                <th className="py-2.5 px-4 text-right w-24 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((q) => {
                const inq = q.inquiry_id
                  ? inquiries.find((i) => i.id === q.inquiry_id) ?? null
                  : null;
                const qty = inq?.quantity ?? null;
                const target = inq?.target_price ? Number(inq.target_price) : null;
                const quoted = q.total_amount ? Number(q.total_amount) : null;
                let profitPct: string | null = null;
                const workflowAction = getQuotationWorkflowAction(q.status);
                if (
                  qty != null &&
                  target != null &&
                  quoted != null &&
                  Number.isFinite(qty) &&
                  Number.isFinite(target) &&
                  Number.isFinite(quoted)
                ) {
                  const baseline = qty * target;
                  if (baseline) {
                    const pct = ((quoted - baseline) / baseline) * 100;
                    profitPct = `${pct.toFixed(1)}%`;
                  }
                }
                return (
                  <tr key={q.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/70">
                    <td className="py-2.5 px-4 font-medium text-text-primary whitespace-nowrap overflow-hidden text-ellipsis" title={q.quotation_code}>
                      <Link
                        to={`/app/quotations/${q.id}`}
                        className="text-status-info hover:underline"
                      >
                        {q.quotation_code}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={customerName(q.customer_id)}>
                      {customerName(q.customer_id)}
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={inquiryCode(q.inquiry_id)}>
                      {inquiryCode(q.inquiry_id)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 min-w-0">
                        {q.style_image_url ? (
                          <SecureImage
                            url={q.style_image_url}
                            alt={q.style_name ?? q.style_ref ?? "Style"}
                            className="h-8 w-8 shrink-0 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded bg-surface-subtle border border-border" />
                        )}
                        <span className="text-text-secondary truncate block min-w-0" title={q.style_name ?? q.style_ref ?? undefined}>
                          {q.style_name ?? q.style_ref ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={q.intermediary_name ?? undefined}>
                      {q.intermediary_name ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={q.shipping_term ?? undefined}>
                      {q.shipping_term ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={q.commission_mode || q.commission_type || q.commission_value ? `${q.commission_mode ?? "-"} / ${q.commission_type ?? "-"} / ${q.commission_value ?? "-"}` : undefined}>
                      {q.commission_mode || q.commission_type || q.commission_value
                        ? `${q.commission_mode ?? "-"} / ${q.commission_type ?? "-"} / ${q.commission_value ?? "-"}`
                        : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right text-text-secondary whitespace-nowrap">
                      {qty != null ? qty.toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={`${formatAmount(q.total_amount)} ${q.currency ?? ""}`.trim()}>
                      {formatAmount(q.total_amount)} {q.currency ?? ""}
                    </td>
                    <td className="py-2.5 px-4 text-right text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={profitPct ?? undefined}>
                      {profitPct ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary overflow-hidden text-ellipsis" title={[q.status, q.is_converted_to_order ? "Converted to order" : null].filter(Boolean).join(" · ")}>
                      <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap min-w-0">
                        <QuotationStatusBadge status={q.status} />
                        {q.is_converted_to_order && (
                          <span className="inline-flex rounded-full bg-status-info-subtle px-2 py-0.5 text-xs font-medium text-status-info-foreground">
                            Converted to order
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={new Date(q.created_at).toLocaleDateString()}>
                      {new Date(q.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === q.id ? null : q.id))}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === q.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <Link
                              to={`/app/quotations/${q.id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View
                            </Link>
                            <Link
                              to={`/app/quotations/${q.id}/print`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Print
                            </Link>
                            {workflowAction && (
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenActionsId(null);
                                  try {
                                    setError("");
                                    if (workflowAction.action === "submit") {
                                      await api.submitQuotation(q.id);
                                    } else if (workflowAction.action === "approve") {
                                      await api.approveQuotation(q.id);
                                    } else {
                                      await api.sendQuotation(q.id);
                                    }
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Workflow action failed");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                {workflowAction.label}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenActionsId(null);
                                try {
                                  setError("");
                                  const duplicated = await api.reviseQuotation(q.id);
                                  navigate(`/app/quotations/${duplicated.id}`);
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "Duplicate version failed");
                                }
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenActionsId(null);
                                if (!window.confirm("Delete this quotation?")) return;
                                try {
                                  setError("");
                                  await api.deleteQuotation(q.id);
                                  await load();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "Delete failed");
                                }
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Delete
                            </button>
                            {q.is_converted_to_order ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Already converted
                              </div>
                            ) : !canConvertQuotationToOrder(q.status) ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Send first
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenActionsId(null);
                                  try {
                                    setError("");
                                    const order = await api.convertQuotationToOrder(q.id);
                                    alert(`Order ${order.order_code} created from quotation.`);
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Conversion failed");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Convert to order
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

