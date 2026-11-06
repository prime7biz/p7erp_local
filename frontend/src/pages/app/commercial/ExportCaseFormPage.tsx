import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type ExportCaseCreate, type ExportCaseUpdate, type OrderResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";

type FormState = {
  reference: string;
  status: string;
  case_date: string;
  amount: string;
  order_id: string;
  trade_case_id: string;
  export_license_number: string;
  destination_country: string;
  shipping_mode: string;
  incoterms: string;
  expected_shipment_date: string;
  actual_shipment_date: string;
  customs_agent: string;
};

const emptyForm = (orderIdPrefill?: string): FormState => ({
  reference: "",
  status: "DRAFT",
  case_date: todayLocalISO(),
  amount: "",
  order_id: orderIdPrefill ?? "",
  trade_case_id: "",
  export_license_number: "",
  destination_country: "",
  shipping_mode: "SEA",
  incoterms: "FOB",
  expected_shipment_date: "",
  actual_shipment_date: "",
  customs_agent: "",
});

const SHIPPING_MODES = ["AIR", "SEA", "ROAD"] as const;
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DDP"] as const;
const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;

export function ExportCaseFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id && id !== "new");
  const numericId = Number(id);
  const orderIdPrefill = searchParams.get("order_id") ?? "";

  const [form, setForm] = useState<FormState>(() => emptyForm(orderIdPrefill));
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .listOrders({ limit: 200 })
      .then((rows) => setOrders(Array.isArray(rows) ? rows : []))
      .catch((e) => logApiError("ExportCaseFormPage.listOrders", e));
  }, []);

  useEffect(() => {
    if (!isEdit || !Number.isFinite(numericId) || numericId <= 0) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const row = await api.getExportCase(numericId);
        if (cancelled) return;
        setForm({
          reference: String(row.reference ?? row.case_code ?? ""),
          status: String(row.status ?? "DRAFT"),
          case_date: row.case_date ? String(row.case_date).slice(0, 10) : "",
          amount: row.amount != null ? String(row.amount) : "",
          order_id: row.order_id != null ? String(row.order_id) : "",
          trade_case_id: row.trade_case_id != null ? String(row.trade_case_id) : "",
          export_license_number: String(row.export_license_number ?? ""),
          destination_country: String(row.destination_country ?? ""),
          shipping_mode: String(row.shipping_mode ?? "SEA"),
          incoterms: String(row.incoterms ?? "FOB"),
          expected_shipment_date: row.expected_shipment_date
            ? String(row.expected_shipment_date).slice(0, 10)
            : "",
          actual_shipment_date: row.actual_shipment_date
            ? String(row.actual_shipment_date).slice(0, 10)
            : "",
          customs_agent: String(row.customs_agent ?? ""),
        });
      } catch (e) {
        logApiError("ExportCaseFormPage.load", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load export case");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, numericId]);

  // Auto-populate from order when creating with order_id
  useEffect(() => {
    if (isEdit) return;
    const oid = Number(form.order_id || 0);
    if (!oid) {
      setSelectedOrder(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const order = await api.getOrder(oid);
        if (cancelled) return;
        setSelectedOrder(order);
        let country = "";
        try {
          const customer = await api.getCustomer(order.customer_id);
          country = customer.country || "";
        } catch {
          /* ignore */
        }
        setForm((prev) => ({
          ...prev,
          reference: prev.reference || `EXP-${order.order_code}`,
          expected_shipment_date: prev.expected_shipment_date || (order.delivery_date || "").slice(0, 10),
          destination_country: prev.destination_country || country,
          amount:
            prev.amount ||
            (order.commercial_snapshot && typeof order.commercial_snapshot === "object"
              ? String(
                  (order.commercial_snapshot as { total_amount?: number }).total_amount ??
                    (order.commercial_snapshot as { amount?: number }).amount ??
                    "",
                )
              : prev.amount),
        }));
      } catch (e) {
        logApiError("ExportCaseFormPage.orderPrefill", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.order_id, isEdit]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders.slice(0, 40);
    return orders
      .filter(
        (o) =>
          o.order_code.toLowerCase().includes(q) ||
          (o.customer_name || "").toLowerCase().includes(q) ||
          String(o.id).includes(q),
      )
      .slice(0, 40);
  }, [orders, orderSearch]);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const reference = form.reference.trim();
    if (!reference) {
      setError("Reference is required");
      return;
    }
    if (
      form.expected_shipment_date &&
      selectedOrder?.delivery_date &&
      form.expected_shipment_date > selectedOrder.delivery_date.slice(0, 10)
    ) {
      setError("Expected shipment date must be on or before the order delivery date");
      return;
    }
    if (
      form.expected_shipment_date &&
      form.actual_shipment_date &&
      form.actual_shipment_date < form.expected_shipment_date
    ) {
      setError("Actual shipment date must be on or after the expected shipment date");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const orderId = form.order_id.trim() ? Number(form.order_id) : null;
      const tradeCaseId = form.trade_case_id.trim() ? Number(form.trade_case_id) : null;
      const amount = form.amount.trim() ? Number(form.amount) : null;
      const payload: ExportCaseCreate = {
        reference,
        status: form.status || "DRAFT",
        case_date: form.case_date || null,
        amount: Number.isFinite(amount as number) ? amount : null,
        order_id: orderId && Number.isFinite(orderId) ? orderId : null,
        trade_case_id: tradeCaseId && Number.isFinite(tradeCaseId) ? tradeCaseId : null,
        export_license_number: form.export_license_number.trim() || null,
        destination_country: form.destination_country.trim() || null,
        shipping_mode: form.shipping_mode || null,
        incoterms: form.incoterms || null,
        expected_shipment_date: form.expected_shipment_date || null,
        actual_shipment_date: form.actual_shipment_date || null,
        customs_agent: form.customs_agent.trim() || null,
      };
      if (isEdit) {
        await api.updateExportCase(numericId, payload as ExportCaseUpdate);
      } else {
        await api.createExportCase(payload);
      }
      navigate("/app/commercial/export-cases");
    } catch (e) {
      logApiError("ExportCaseFormPage.save", e);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-text-muted">Loading…</div>;
  }

  return (
    <div className="space-y-4 p-6">
      <AppPageHeader
        backTo={{ label: "Export cases", to: "/app/commercial/export-cases" }}
        title={isEdit ? "Edit Export Case" : "New Export Case"}
        description="Link an order, set shipping details, and track export license status."
      />
      {error ? (
        <div className="rounded border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="grid max-w-4xl gap-4 rounded-xl border border-border bg-surface-raised p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-text-secondary">Order</label>
          <input
            className="mb-2 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            placeholder="Search order code / customer…"
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
          />
          <select
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.order_id}
            onChange={(e) => setForm((p) => ({ ...p, order_id: e.target.value }))}
          >
            <option value="">Select order</option>
            {filteredOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_code} · {o.customer_name ?? `Customer #${o.customer_id}`}
              </option>
            ))}
          </select>
          {selectedOrder ? (
            <p className="mt-1 text-xs text-text-muted">
              Delivery {selectedOrder.delivery_date || "—"} · Qty {selectedOrder.quantity ?? "—"}
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Reference *</label>
          <input
            required
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.reference}
            onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Status</label>
          <select
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Export license number</label>
          <input
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.export_license_number}
            onChange={(e) => setForm((p) => ({ ...p, export_license_number: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Destination country</label>
          <input
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.destination_country}
            onChange={(e) => setForm((p) => ({ ...p, destination_country: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Shipping mode</label>
          <select
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.shipping_mode}
            onChange={(e) => setForm((p) => ({ ...p, shipping_mode: e.target.value }))}
          >
            {SHIPPING_MODES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Incoterms</label>
          <select
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.incoterms}
            onChange={(e) => setForm((p) => ({ ...p, incoterms: e.target.value }))}
          >
            {INCOTERMS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Expected shipment date</label>
          <input
            type="date"
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.expected_shipment_date}
            onChange={(e) => setForm((p) => ({ ...p, expected_shipment_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Actual shipment date</label>
          <input
            type="date"
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.actual_shipment_date}
            onChange={(e) => setForm((p) => ({ ...p, actual_shipment_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Customs agent</label>
          <input
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.customs_agent}
            onChange={(e) => setForm((p) => ({ ...p, customs_agent: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Case date</label>
          <input
            type="date"
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.case_date}
            onChange={(e) => setForm((p) => ({ ...p, case_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Amount (reference)</label>
          <input
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
          />
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
          </button>
          <Link to="/app/commercial/export-cases" className="rounded-lg border px-4 py-2 text-sm text-text-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
