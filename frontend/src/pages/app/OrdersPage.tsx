import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

export function OrdersPage() {
  const [items, setItems] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    return items;
  }, [items]);

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
    setEditing(null);
    setForm({ customer_id: 0 });
    setModalOpen(true);
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
      if (editing) {
        await api.updateOrder(editing.id, form);
      } else {
        await api.createOrder(form);
      }
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            View and manage confirmed sales orders in the merchandising pipeline.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            placeholder="Search by code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="NEW">New</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary/90"
        >
          New order
        </button>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading orders…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No orders yet.</div>
        ) : (
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="py-2 px-4">Code</th>
                <th className="py-2 px-4">Customer</th>
                <th className="py-2 px-4">Quotation</th>
                <th className="py-2 px-4">Style</th>
                <th className="py-2 px-4">Intermediary</th>
                <th className="py-2 px-4">Shipping</th>
                <th className="py-2 px-4">Commission</th>
                <th className="py-2 px-4">Delivery date</th>
                <th className="py-2 px-4 text-right">Qty</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((o) => {
                const linkedQuotation =
                  o.quotation_id != null ? quotationLookup.get(o.quotation_id) ?? null : null;
                const styleName = o.style_name ?? linkedQuotation?.style_name ?? null;
                const styleRef = o.style_ref ?? linkedQuotation?.style_ref ?? null;
                const styleImageUrl = o.style_image_url ?? linkedQuotation?.style_image_url ?? null;
                const intermediaryName = o.intermediary_name ?? linkedQuotation?.intermediary_name ?? null;
                const shippingTerm = o.shipping_term ?? linkedQuotation?.shipping_term ?? null;
                const commissionMode = o.commission_mode ?? linkedQuotation?.commission_mode ?? null;
                const commissionType = o.commission_type ?? linkedQuotation?.commission_type ?? null;
                const commissionValue = o.commission_value ?? linkedQuotation?.commission_value ?? null;

                return (
                <tr key={o.id} className="border-b border-gray-100 last:border-0 align-top">
                  <td className="py-2 px-4 font-medium text-gray-900">
                    <Link
                      to={`/app/orders/${o.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {o.order_code}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-gray-700">{customerName(o.customer_id)}</td>
                  <td className="py-2 px-4 text-gray-700">{quotationCode(o.quotation_id)}</td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      {styleImageUrl ? (
                        <img
                          src={styleImageUrl}
                          alt={styleName ?? styleRef ?? "Style"}
                          className="h-8 w-8 rounded object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-gray-100 border border-gray-200" />
                      )}
                      <div className="text-gray-700">
                        <div>{styleName ?? styleRef ?? "—"}</div>
                        {styleName && styleRef && styleName !== styleRef && (
                          <div className="text-xs text-gray-500">{styleRef}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-gray-700">{intermediaryName ?? "—"}</td>
                  <td className="py-2 px-4 text-gray-700">{shippingTerm ?? "—"}</td>
                  <td className="py-2 px-4 text-gray-700">
                    {commissionMode || commissionType || commissionValue
                      ? `${commissionMode ?? "-"} / ${commissionType ?? "-"} / ${commissionValue ?? "-"}`
                      : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-700">
                    {o.quantity != null ? o.quantity.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">{o.status}</td>
                  <td className="py-2 px-4 text-right space-x-2">
                    <Link
                      to={`/app/orders/${o.id}`}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
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
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Delete this order?")) return;
                        try {
                          setError("");
                          await api.deleteOrder(o.id);
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Delete failed");
                        }
                      }}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          disabled={items.length < pageSize}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New order</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer
                </label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_id: Number(e.target.value) || 0 }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Style ref
                </label>
                <input
                  type="text"
                  value={form.style_ref ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, style_ref: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shipping term
                  </label>
                  <select
                    value={form.shipping_term ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, shipping_term: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Commission mode
                  </label>
                  <select
                    value={form.commission_mode ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_mode: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Commission type
                  </label>
                  <select
                    value={form.commission_type ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_type: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Commission value
                  </label>
                  <input
                    type="text"
                    value={form.commission_value ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_value: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery date
                </label>
                <input
                  type="date"
                  value={form.delivery_date ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, delivery_date: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={form.status ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select status…</option>
                  <option value="DRAFT">Draft</option>
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white"
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

