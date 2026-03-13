import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type OrderAmendmentResponse,
  type CustomerResponse,
  type QuotationResponse,
} from "@/api/client";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<OrderResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [quotation, setQuotation] = useState<QuotationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amendments, setAmendments] = useState<OrderAmendmentResponse[]>([]);
  const [newStatus, setNewStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const order = await api.getOrder(Number(id));
        setItem(order);
        const [cust, quote] = await Promise.all([
          api.getCustomer(order.customer_id),
          order.quotation_id ? api.getQuotation(order.quotation_id) : Promise.resolve(null),
        ]);
        setCustomer(cust);
        setQuotation(quote);
        setAmendments(await api.listOrderAmendments(order.id));
        setNewStatus(order.status);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading order…</div>;
  }

  if (error || !item) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-red-600 text-sm">{error || "Order not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/orders")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Back to orders
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Order {item.order_code}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {customer?.name ?? `Customer #${item.customer_id}`} ·{" "}
            {item.status}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/orders")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Back to list
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <div>
              <span className="font-medium">Customer:</span>{" "}
              {customer?.name ?? `#${item.customer_id}`}
            </div>
            <div>
              <span className="font-medium">Quotation:</span>{" "}
              {quotation ? (
                <Link
                  to={`/app/quotations/${quotation.id}`}
                  className="text-indigo-600 hover:underline"
                >
                  {quotation.quotation_code}
                </Link>
              ) : (
                "—"
              )}
            </div>
            <div>
              <span className="font-medium">Style ref:</span>{" "}
              {item.style_ref ?? "—"}
            </div>
            <div>
              <span className="font-medium">Style name:</span>{" "}
              {item.style_name ?? "—"}
            </div>
            <div>
              <span className="font-medium">Intermediary:</span>{" "}
              {item.intermediary_name ?? "—"}
            </div>
            <div>
              <span className="font-medium">Shipping term:</span>{" "}
              {item.shipping_term ?? "—"}
            </div>
            <div>
              <span className="font-medium">Commission:</span>{" "}
              {item.commission_mode || item.commission_type || item.commission_value
                ? `${item.commission_mode ?? "-"} / ${item.commission_type ?? "-"} / ${item.commission_value ?? "-"}`
                : "—"}
            </div>
            {item.style_image_url && (
              <img
                src={item.style_image_url}
                alt={item.style_name ?? item.style_ref ?? "Style"}
                className="h-20 w-20 rounded object-cover border border-gray-200"
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Schedule & Quantity</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <div>
              <span className="font-medium">Order date:</span>{" "}
              {item.order_date
                ? new Date(item.order_date).toLocaleDateString()
                : "—"}
            </div>
            <div>
              <span className="font-medium">Delivery date:</span>{" "}
              {item.delivery_date
                ? new Date(item.delivery_date).toLocaleDateString()
                : "—"}
            </div>
            <div>
              <span className="font-medium">Quantity:</span>{" "}
              {item.quantity != null ? item.quantity.toLocaleString() : "—"}
            </div>
            <div className="pt-2 flex items-center gap-2">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="NEW">NEW</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
              <button
                onClick={async () => {
                  const updated = await api.updateOrderStatus(item.id, newStatus);
                  setItem(updated);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
              >
                Update status
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Remarks</h2>
        <p className="text-sm text-gray-700">
          {item.remarks || "No remarks added."}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Amendments</h2>
          <button
            onClick={async () => {
              await api.createOrderAmendment(item.id, {
                field_changed: "status",
                old_value: item.status,
                new_value: newStatus,
                reason: "Manual update",
              });
              setAmendments(await api.listOrderAmendments(item.id));
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
          >
            Add amendment snapshot
          </button>
        </div>
        {amendments.length === 0 ? (
          <div className="text-xs text-gray-500">No amendments yet.</div>
        ) : (
          <div className="space-y-1">
            {amendments.map((a) => (
              <div key={a.id} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700">
                #{a.amendment_no} · {a.field_changed}: {a.old_value ?? "—"} {" -> "} {a.new_value ?? "—"} ({a.status})
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Created at {new Date(item.created_at).toLocaleString()} · Updated at{" "}
        {new Date(item.updated_at).toLocaleString()}
      </div>
    </div>
  );
}

