import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type InquiryResponse, type CustomerResponse } from "@/api/client";
import { useSecureImage } from "@/hooks/useSecureImage";

export function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<InquiryResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const styleImageUrl = useSecureImage(item?.style_image_url);

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
    return <div className="p-6 text-text-muted">Loading inquiry…</div>;
  }

  if (error || !item) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-status-danger text-sm">{error || "Inquiry not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/inquiries")}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Back to inquiries
        </button>
      </div>
    );
  }

  const missingForQuotation: string[] = [];
  if (!item.style_id) missingForQuotation.push("Style");
  if (!item.quantity) missingForQuotation.push("Quantity");
  if (!item.target_price) missingForQuotation.push("Target Price");
  if (!item.target_price_currency) missingForQuotation.push("Target Currency");
  if (!item.exchange_rate) missingForQuotation.push("Exchange Rate");

  const convertInquiry = async () => {
    if (!item) return;
    setConverting(true);
    setError("");
    try {
      const quotation = await api.convertInquiryToQuotation(item.id);
      navigate(`/app/quotations/${quotation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert inquiry");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Inquiry {item.inquiry_code}
          </h1>
          <p className="text-text-muted text-sm mt-0.5">
            {customer?.name ?? `Customer #${item.customer_id}`} ·{" "}
            {item.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/inquiries")}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          >
            Back to list
          </button>
          <button
            type="button"
            onClick={() => window.open(`/app/inquiries/${item.id}/print`, "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          >
            Print / Save PDF
          </button>
          {item.converted_quotation_id ? (
            <button
              type="button"
              onClick={() => navigate(`/app/quotations/${item.converted_quotation_id}`)}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
            >
              Open quotation
            </button>
          ) : (
            <button
              type="button"
              onClick={convertInquiry}
              disabled={converting}
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
            >
              {converting ? "Converting..." : "Convert to quotation"}
            </button>
          )}
        </div>
      </div>

      {missingForQuotation.length > 0 && (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-sm text-status-warning-foreground">
          Missing recommended fields for clean quotation prefill: {missingForQuotation.join(", ")}.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
          <div className="text-sm text-text-secondary">
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

        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Commercials</h2>
          <div className="text-sm text-text-secondary">
            <div>
              <span className="font-medium">Target price:</span>{" "}
              {item.target_price ?? "—"}
            </div>
            <div>
              <span className="font-medium">Target currency:</span>{" "}
              {item.target_price_currency ?? "—"}
            </div>
            <div>
              <span className="font-medium">Document currency:</span>{" "}
              {item.currency ?? "—"}
            </div>
            <div>
              <span className="font-medium">Exchange rate:</span>{" "}
              {item.exchange_rate ?? "—"}
            </div>
            <div>
              <span className="font-medium">Quantity:</span>{" "}
              {item.quantity != null ? item.quantity.toLocaleString() : "—"}
            </div>
            <div>
              <span className="font-medium">Expected delivery:</span>{" "}
              {item.expected_delivery_date ?? "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Style & Intermediary</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            {styleImageUrl ? (
              <img
                src={styleImageUrl}
                alt={item.style_name ?? item.style_ref ?? "Style"}
                className="h-20 w-20 rounded object-cover border border-border"
              />
            ) : (
              <div className="h-20 w-20 rounded bg-surface-subtle border border-border flex items-center justify-center text-xs text-text-muted">
                No image
              </div>
            )}
            <div className="text-sm text-text-secondary">
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
          <div className="text-sm text-text-secondary space-y-1">
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

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Notes</h2>
        <p className="text-sm text-text-secondary">
          {item.notes || "No notes added."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Garment items</h2>
        {item.items?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Description</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {item.items.map((line, index) => (
                  <tr key={line.id} className="border-t border-border-subtle">
                    <td className="py-2 px-3 text-text-secondary">{index + 1}</td>
                    <td className="py-2 px-3 text-text-primary">{line.item_name ?? "—"}</td>
                    <td className="py-2 px-3 text-text-secondary">{line.description ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-text-secondary">
                      {line.quantity != null ? line.quantity.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No garment items added.</p>
        )}
      </div>

      <div className="text-xs text-text-muted">
        Created at {new Date(item.created_at).toLocaleString()} · Updated at{" "}
        {new Date(item.updated_at).toLocaleString()}
      </div>
    </div>
  );
}

