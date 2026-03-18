import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type CustomerResponse,
  type OrderCreate,
  type QuotationResponse,
} from "@/api/client";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";

export function OrderCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<OrderCreate>({ customer_id: 0 });
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [quotations, setQuotations] = useState<QuotationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const quotationsById = useMemo(
    () => new Map<number, QuotationResponse>(quotations.map((row) => [row.id, row])),
    [quotations]
  );
  const selectedCustomer = useMemo(
    () => customers.find((row) => row.id === form.customer_id) ?? null,
    [customers, form.customer_id]
  );
  const selectedQuotation = useMemo(
    () => (form.quotation_id ? quotationsById.get(form.quotation_id) ?? null : null),
    [form.quotation_id, quotationsById]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [customersData, quotationsData] = await Promise.all([
          api.listCustomers(),
          api.listQuotations({ limit: 200, offset: 0 }),
        ]);
        setCustomers(customersData);
        setQuotations(quotationsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load order form data");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) {
      setError("Customer is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.createOrder(form);
      navigate(`/app/orders/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create order failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-12 text-center text-text-muted">
        Loading order form...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">New Order</h1>
          <p className="text-sm text-text-muted">
            Create a polished final order with customer, quotation link, delivery schedule, and commercial terms.
          </p>
        </div>
        <Link
          to="/app/orders"
          className="inline-flex items-center rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
        >
          Back to orders
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface-raised p-5 space-y-5">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">Basic information</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Customer</label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customer_id: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Linked quotation (optional)</label>
                <select
                  value={form.quotation_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => {
                      const nextQuotationId = e.target.value ? Number(e.target.value) : undefined;
                      const quote = nextQuotationId ? quotationsById.get(nextQuotationId) ?? null : null;
                      return {
                        ...prev,
                        quotation_id: nextQuotationId,
                        customer_id: quote?.customer_id ?? prev.customer_id,
                        style_id: quote?.style_id ?? prev.style_id,
                        style_ref: quote?.style_ref ?? prev.style_ref,
                        customer_intermediary_id:
                          quote?.customer_intermediary_id ?? prev.customer_intermediary_id,
                        shipping_term: quote?.shipping_term ?? prev.shipping_term,
                        commission_mode: quote?.commission_mode ?? prev.commission_mode,
                        commission_type: quote?.commission_type ?? prev.commission_type,
                        commission_value: quote?.commission_value ?? prev.commission_value,
                      };
                    })
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value="">No linked quotation</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quotation_code}
                      {q.is_converted_to_order ? " (converted)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">Style and shipment</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Style reference</label>
                <input
                  type="text"
                  value={form.style_ref ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      style_ref: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Style ID</label>
                <input
                  type="number"
                  value={form.style_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      style_id: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Shipping term</label>
                <select
                  value={form.shipping_term ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      shipping_term: e.target.value || undefined,
                    }))
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
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">Commission and timeline</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Commission mode</label>
                <select
                  value={form.commission_mode ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      commission_mode: e.target.value || undefined,
                    }))
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
                <label className="block text-sm font-medium text-text-secondary mb-1">Commission type</label>
                <select
                  value={form.commission_type ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      commission_type: e.target.value || undefined,
                    }))
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
                <label className="block text-sm font-medium text-text-secondary mb-1">Commission value</label>
                <input
                  type="text"
                  value={form.commission_value ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      commission_value: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Order date</label>
                <input
                  type="date"
                  value={form.order_date ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      order_date: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Delivery date</label>
                <input
                  type="date"
                  value={form.delivery_date ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      delivery_date: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Quantity</label>
                <input
                  type="number"
                  value={form.quantity ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
                <select
                  value={form.status ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value="">Select status...</option>
                  <option value="DRAFT">Draft</option>
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-text-primary">Notes</h2>
            <textarea
              value={form.remarks ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  remarks: e.target.value || undefined,
                }))
              }
              rows={4}
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              placeholder="Add any important order notes..."
            />
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate("/app/orders")}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Create order"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <h3 className="text-sm font-semibold text-text-primary">Live summary</h3>
            <div className="mt-3 space-y-1 text-sm text-text-secondary">
              <div><span className="font-medium">Customer:</span> {selectedCustomer?.name ?? "Not selected"}</div>
              <div><span className="font-medium">Quotation:</span> {selectedQuotation?.quotation_code ?? "Not linked"}</div>
              <div><span className="font-medium">Style:</span> {form.style_ref ?? "—"}</div>
              <div><span className="font-medium">Shipping:</span> {form.shipping_term ?? "—"}</div>
              <div><span className="font-medium">Quantity:</span> {form.quantity ?? "—"}</div>
              <div><span className="font-medium">Status:</span> {form.status ?? "DRAFT (default)"}</div>
            </div>
          </div>

          <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-4">
            <h3 className="text-sm font-semibold text-brand-primary">Helpful tip</h3>
            <p className="mt-2 text-xs text-brand-primary">
              If you select a quotation, customer and commercial terms are auto-filled.
              You can still adjust fields before saving.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
