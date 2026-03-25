import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type OrderCreate,
  type CustomerResponse,
  type QuotationResponse,
} from "@/api/client";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";
import { getOrderStatusChoices } from "@/features/merch/workflow";
import { SecureImage } from "@/components/SecureImage";

export function OrdersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "linked_quotation" | "draft" | "active">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrderResponse | null>(null);
  const [form, setForm] = useState<OrderCreate>({ customer_id: 0 });
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [quotations, setQuotations] = useState<QuotationResponse[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [orders, custs] = await Promise.all([
        api.listOrders({
          search,
          status: statusFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        api.listCustomers(),
      ]);
      setItems(orders);
      setCustomers(custs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (quickFilter === "linked_quotation") return items.filter((row) => row.quotation_id != null);
    if (quickFilter === "draft") return items.filter((row) => row.status === "DRAFT");
    if (quickFilter === "active")
      return items.filter((row) => ["NEW", "CONFIRMED", "IN_PROGRESS"].includes(row.status));
    return items;
  }, [items, quickFilter]);

  const customerName = (id: number) =>
    customers.find((c) => c.id === id)?.name ?? `#${id}`;

  const quotationCode = (id: number | null) =>
    id == null ? "—" : quotations.find((q) => q.id === id)?.quotation_code ?? `#${id}`;

  const quotationLookup = useMemo(
    () => new Map<number, QuotationResponse>(quotations.map((q) => [q.id, q])),
    [quotations]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page]);

  useEffect(() => {
    const loadQuotations = async () => {
      try {
        const data = await api.listQuotations({ limit: 200, offset: 0 });
        setQuotations(data);
      } catch {
        // ignore
      }
    };
    loadQuotations();
  }, []);

  const openCreate = () => {
    navigate("/app/orders/new");
  };

  const statusClass = (statusValue: string) => {
    const value = statusValue.toUpperCase();
    if (value === "COMPLETED") return "bg-status-success-subtle text-status-success-foreground";
    if (value === "IN_PROGRESS") return "bg-status-info-subtle text-status-info-foreground";
    if (value === "CONFIRMED") return "bg-status-success-subtle/80 text-status-success-foreground";
    if (value === "NEW") return "bg-brand-primary/10 text-brand-primary";
    return "bg-status-neutral-subtle text-status-neutral-foreground";
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm({ customer_id: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) {
      setError("Customer ID is required");
      return;
    }
    setError("");
    try {
      if (!editing) return;
      await api.updateOrder(editing.id, form);
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const draftCount = filteredItems.filter((row) => row.status === "DRAFT").length;
  const activeCount = filteredItems.filter((row) =>
    ["NEW", "CONFIRMED", "IN_PROGRESS"].includes(row.status),
  ).length;
  const completedCount = filteredItems.filter((row) => row.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
          <p className="text-text-muted text-sm mt-0.5">
            Manage final sales orders with clear workflow, conversion links, and delivery tracking.
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
            <option value="DRAFT">Draft</option>
            <option value="NEW">New</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
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
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
        >
          New order
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All" },
          { key: "linked_quotation", label: "Linked quotation" },
          { key: "draft", label: "Draft only" },
          { key: "active", label: "Active" },
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Total on page</div>
          <div className="text-xl font-bold text-text-primary">{filteredItems.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Draft</div>
          <div className="text-xl font-bold text-status-neutral-foreground">{draftCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Active</div>
          <div className="text-xl font-bold text-status-info-foreground">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Completed</div>
          <div className="text-xl font-bold text-status-success-foreground">{completedCount}</div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-text-muted">Loading orders…</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2.5 px-4 w-24 whitespace-nowrap">Code</th>
                <th className="py-2.5 px-4 min-w-[120px]">Customer</th>
                <th className="py-2.5 px-4 w-24 whitespace-nowrap">Quotation</th>
                <th className="py-2.5 px-4 min-w-[140px]">Style</th>
                <th className="py-2.5 px-4 min-w-[100px] whitespace-nowrap">Intermediary</th>
                <th className="py-2.5 px-4 w-20 whitespace-nowrap">Shipping</th>
                <th className="py-2.5 px-4 min-w-[120px] whitespace-nowrap">Commission</th>
                <th className="py-2.5 px-4 w-28 whitespace-nowrap">Delivery date</th>
                <th className="py-2.5 px-4 text-right w-20 whitespace-nowrap">Qty</th>
                <th className="py-2.5 px-4 w-24 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-4 text-right w-24 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((o) => {
                const linkedQuotation =
                  o.quotation_id != null ? quotationLookup.get(o.quotation_id) ?? null : null;
                const styleName = o.style_name ?? linkedQuotation?.style_name ?? null;
                const styleRef = o.style_ref ?? linkedQuotation?.style_ref ?? null;
                const styleImageForRow = o.style_image_url ?? linkedQuotation?.style_image_url ?? null;
                const intermediaryName = o.intermediary_name ?? linkedQuotation?.intermediary_name ?? null;
                const shippingTerm = o.shipping_term ?? linkedQuotation?.shipping_term ?? null;
                const commissionMode = o.commission_mode ?? linkedQuotation?.commission_mode ?? null;
                const commissionType = o.commission_type ?? linkedQuotation?.commission_type ?? null;
                const commissionValue = o.commission_value ?? linkedQuotation?.commission_value ?? null;

                return (
                <tr key={o.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/70">
                  <td className="py-2.5 px-4 font-medium text-text-primary whitespace-nowrap">
                    <Link
                      to={`/app/orders/${o.id}`}
                      className="text-status-info hover:underline"
                    >
                      {o.order_code}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={customerName(o.customer_id)}>
                    {customerName(o.customer_id)}
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={quotationCode(o.quotation_id)}>
                    {quotationCode(o.quotation_id)}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2 min-w-0">
                      {styleImageForRow ? (
                        <SecureImage
                          url={styleImageForRow}
                          alt={styleName ?? styleRef ?? "Style"}
                          className="h-8 w-8 shrink-0 rounded object-cover border border-border"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded bg-surface-subtle border border-border" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-text-secondary truncate" title={styleName ?? styleRef ?? undefined}>
                          {styleName ?? styleRef ?? "—"}
                        </div>
                        {styleName && styleRef && styleName !== styleRef && (
                          <div className="text-xs text-text-muted truncate whitespace-nowrap" title={styleRef}>
                            {styleRef}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={intermediaryName ?? undefined}>
                    {intermediaryName ?? "—"}
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={shippingTerm ?? undefined}>
                    {shippingTerm ?? "—"}
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={commissionMode || commissionType || commissionValue ? `${commissionMode ?? "-"} / ${commissionType ?? "-"} / ${commissionValue ?? "-"}` : undefined}>
                    {commissionMode || commissionType || commissionValue
                      ? `${commissionMode ?? "-"} / ${commissionType ?? "-"} / ${commissionValue ?? "-"}`
                      : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis" title={o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : undefined}>
                    {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right text-text-secondary whitespace-nowrap">
                    {o.quantity != null ? o.quantity.toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-text-secondary whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((prev) => (prev === o.id ? null : o.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Actions
                      </button>
                      {openActionsId === o.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                          <Link
                            to={`/app/orders/${o.id}`}
                            onClick={() => setOpenActionsId(null)}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            View
                          </Link>
                          <Link
                            to={`/app/orders/${o.id}/print`}
                            onClick={() => setOpenActionsId(null)}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Print
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              setEditing(o);
                              setForm({
                                customer_id: o.customer_id,
                                quotation_id: o.quotation_id ?? undefined,
                                style_id: o.style_id ?? undefined,
                                style_ref: o.style_ref ?? undefined,
                                customer_intermediary_id: o.customer_intermediary_id ?? undefined,
                                shipping_term: o.shipping_term ?? undefined,
                                commission_mode: o.commission_mode ?? undefined,
                                commission_type: o.commission_type ?? undefined,
                                commission_value: o.commission_value ?? undefined,
                                order_date: o.order_date ?? undefined,
                                delivery_date: o.delivery_date ?? undefined,
                                quantity: o.quantity ?? undefined,
                                status: o.status ?? undefined,
                                remarks: o.remarks ?? undefined,
                              });
                              setModalOpen(true);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setOpenActionsId(null);
                              if (!window.confirm("Delete this order?")) return;
                              try {
                                setError("");
                                await api.deleteOrder(o.id);
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

      {modalOpen && editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Edit order</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Customer
                </label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_id: Number(e.target.value) || 0 }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value={0}>Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Linked quotation (optional)
                </label>
                <select
                  value={form.quotation_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => {
                      const nextQuotationId = e.target.value ? Number(e.target.value) : undefined;
                      const quote = nextQuotationId
                        ? quotations.find((q) => q.id === nextQuotationId) ?? null
                        : null;
                      return {
                        ...f,
                        quotation_id: nextQuotationId,
                        style_id: quote?.style_id ?? f.style_id,
                        style_ref: quote?.style_ref ?? f.style_ref,
                        customer_intermediary_id:
                          quote?.customer_intermediary_id ?? f.customer_intermediary_id,
                        shipping_term: quote?.shipping_term ?? f.shipping_term,
                        commission_mode: quote?.commission_mode ?? f.commission_mode,
                        commission_type: quote?.commission_type ?? f.commission_type,
                        commission_value: quote?.commission_value ?? f.commission_value,
                      };
                    })
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value="">No linked quotation</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quotation_code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Style ref
                </label>
                <input
                  type="text"
                  value={form.style_ref ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, style_ref: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Style ID
                  </label>
                  <input
                    type="number"
                    value={form.style_id ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        style_id: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Shipping term
                  </label>
                  <select
                    value={form.shipping_term ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, shipping_term: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select shipping term</option>
                    {withLegacyOption(form.shipping_term, SHIPPING_TERM_OPTIONS).map((term) => (
                      <option key={term} value={term}>
                        {SHIPPING_TERM_OPTIONS.includes(term as (typeof SHIPPING_TERM_OPTIONS)[number])
                          ? term
                          : `${term} (legacy)`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Commission mode
                  </label>
                  <select
                    value={form.commission_mode ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_mode: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select mode</option>
                    {withLegacyOption(form.commission_mode, COMMISSION_MODE_OPTIONS).map((mode) => (
                      <option key={mode} value={mode}>
                        {COMMISSION_MODE_OPTIONS.includes(mode as (typeof COMMISSION_MODE_OPTIONS)[number])
                          ? mode
                          : `${mode} (legacy)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Commission type
                  </label>
                  <select
                    value={form.commission_type ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_type: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    {withLegacyOption(form.commission_type, COMMISSION_TYPE_OPTIONS).map((type) => (
                      <option key={type} value={type}>
                        {COMMISSION_TYPE_OPTIONS.includes(type as (typeof COMMISSION_TYPE_OPTIONS)[number])
                          ? type
                          : `${type} (legacy)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Commission value
                  </label>
                  <input
                    type="text"
                    value={form.commission_value ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_value: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Delivery date
                </label>
                <input
                  type="date"
                  value={form.delivery_date ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, delivery_date: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Quantity (pcs)
                </label>
                <input
                  type="number"
                  value={form.quantity ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Status
                </label>
                <select
                  value={form.status ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  {getOrderStatusChoices(editing?.status).map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {statusValue}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

