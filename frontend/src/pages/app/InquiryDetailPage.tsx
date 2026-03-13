import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type InquiryResponse, type CustomerResponse } from "@/api/client";

export function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<InquiryResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const inquiry = await api.getInquiry(Number(id));
        setItem(inquiry);
        const cust = await api.getCustomer(inquiry.customer_id);
        setCustomer(cust);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load inquiry");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading inquiry…</div>;
  }

  if (error || !item) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-red-600 text-sm">{error || "Inquiry not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/inquiries")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Back to inquiries
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Inquiry {item.inquiry_code}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {customer?.name ?? `Customer #${item.customer_id}`} ·{" "}
            {item.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/inquiries")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          >
            Back to list
          </button>
          <button
            type="button"
            onClick={() => window.open(`/app/inquiries/${item.id}/print`, "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
          <div className="text-sm text-gray-700">
            <div>
              <span className="font-medium">Customer:</span>{" "}
              {customer?.name ?? `#${item.customer_id}`}
            </div>
            <div>
              <span className="font-medium">Style:</span>{" "}
              {item.style_name ?? item.style_ref ?? "—"}
            </div>
            <div>
              <span className="font-medium">Department:</span>{" "}
              {item.department ?? "—"}
            </div>
            <div>
              <span className="font-medium">Season:</span>{" "}
              {item.season ?? "—"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Commercials</h2>
          <div className="text-sm text-gray-700">
            <div>
              <span className="font-medium">Target price:</span>{" "}
              {item.target_price ?? "—"}
            </div>
            <div>
              <span className="font-medium">Quantity:</span>{" "}
              {item.quantity != null ? item.quantity.toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Style & Intermediary</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            {item.style_image_url ? (
              <img
                src={item.style_image_url}
                alt={item.style_name ?? item.style_ref ?? "Style"}
                className="h-20 w-20 rounded object-cover border border-gray-200"
              />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500">
                No image
              </div>
            )}
            <div className="text-sm text-gray-700">
              <div>
                <span className="font-medium">Style name:</span>{" "}
                {item.style_name ?? "—"}
              </div>
              <div>
                <span className="font-medium">Style ref fallback:</span>{" "}
                {item.style_ref ?? "—"}
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-700 space-y-1">
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
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
        <p className="text-sm text-gray-700">
          {item.notes || "No notes added."}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Garment items</h2>
        {item.items?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Description</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {item.items.map((line, index) => (
                  <tr key={line.id} className="border-t border-gray-100">
                    <td className="py-2 px-3 text-gray-600">{index + 1}</td>
                    <td className="py-2 px-3 text-gray-800">{line.item_name ?? "—"}</td>
                    <td className="py-2 px-3 text-gray-700">{line.description ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {line.quantity != null ? line.quantity.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No garment items added.</p>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Created at {new Date(item.created_at).toLocaleString()} · Updated at{" "}
        {new Date(item.updated_at).toLocaleString()}
      </div>
    </div>
  );
}

