import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type CustomerResponse,
  type OrderResponse,
  type QuotationResponse,
  type SettingsConfigResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/quotation-print.css";

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export function OrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const generatedAt = useMemo(() => new Date(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [quotation, setQuotation] = useState<QuotationResponse | null>(null);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);
  const [printPrefs, setPrintPrefs] = useState({
    showLogo: true,
    showWatermark: true,
    showStylePreview: true,
    showRemarks: true,
    showSignatureBlock: true,
    showFooter: true,
  });
  const [templatePreset, setTemplatePreset] = useState<"standard" | "minimal" | "factory">("standard");

  const applyPreset = (preset: "standard" | "minimal" | "factory") => {
    setTemplatePreset(preset);
    if (preset === "standard") {
      setPrintPrefs({
        showLogo: true,
        showWatermark: true,
        showStylePreview: true,
        showRemarks: true,
        showSignatureBlock: true,
        showFooter: true,
      });
      return;
    }
    if (preset === "minimal") {
      setPrintPrefs({
        showLogo: false,
        showWatermark: false,
        showStylePreview: false,
        showRemarks: true,
        showSignatureBlock: false,
        showFooter: true,
      });
      return;
    }
    setPrintPrefs({
      showLogo: true,
      showWatermark: true,
      showStylePreview: true,
      showRemarks: false,
      showSignatureBlock: true,
      showFooter: true,
    });
  };

  useEffect(() => {
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setError("Invalid order id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const currentOrder = await api.getOrder(orderId);
        setOrder(currentOrder);

        const [cust, quote, cfg] = await Promise.all([
          api.getCustomer(currentOrder.customer_id).catch(() => null),
          currentOrder.quotation_id ? api.getQuotation(currentOrder.quotation_id).catch(() => null) : Promise.resolve(null),
          api.getSettingsConfig().catch(() => null),
        ]);
        setCustomer(cust);
        setQuotation(quote);
        setSettings(cfg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load order print template.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  if (loading) return <div className="min-h-[40vh] p-6 text-sm text-slate-600">Preparing print template...</div>;
  if (error || !order) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "Order not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/orders")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to orders
        </button>
      </div>
    );
  }

  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const tenantAddress = settings?.domain ? `Domain: ${settings.domain}` : "Address not configured in settings";
  const generatedBy = me?.first_name || me?.last_name
    ? `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim()
    : me?.username || me?.email || "System";
  const styleName = order.style_name ?? quotation?.style_name ?? order.style_ref ?? quotation?.style_ref ?? "-";
  const styleImage = order.style_image_url ?? quotation?.style_image_url ?? null;
  const intermediary = order.intermediary_name ?? quotation?.intermediary_name ?? "-";
  const shippingTerm = order.shipping_term ?? quotation?.shipping_term ?? "-";
  const commissionMode = order.commission_mode ?? quotation?.commission_mode ?? "-";
  const commissionType = order.commission_type ?? quotation?.commission_type ?? "-";
  const commissionValue = order.commission_value ?? quotation?.commission_value ?? "-";
  const watermarkText = order.status === "COMPLETED" ? "Final" : "Draft";
  const watermarkClass = watermarkText === "Final" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Printable order template</div>
        <div className="qp-toolbar-actions">
          <Link
            to={`/app/orders/${order.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to order
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
      <div className="no-print mx-auto mb-3 w-full max-w-[210mm] rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-indigo-900">Print template settings</div>
          <div className="flex items-center gap-2">
            <select
              value={templatePreset}
              onChange={(e) => applyPreset(e.target.value as "standard" | "minimal" | "factory")}
              className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs text-indigo-900"
            >
              <option value="standard">Standard</option>
              <option value="minimal">Minimal</option>
              <option value="factory">Factory Copy</option>
            </select>
            <button
              type="button"
              onClick={() => applyPreset("standard")}
              className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-100"
            >
              Reset default
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-indigo-900 md:grid-cols-3">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={printPrefs.showLogo}
              onChange={(e) => setPrintPrefs((prev) => ({ ...prev, showLogo: e.target.checked }))}
            />
            Show logo
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={printPrefs.showWatermark}
              onChange={(e) => setPrintPrefs((prev) => ({ ...prev, showWatermark: e.target.checked }))}
            />
            Show watermark
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={printPrefs.showStylePreview}
              onChange={(e) => setPrintPrefs((prev) => ({ ...prev, showStylePreview: e.target.checked }))}
            />
            Show style preview
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={printPrefs.showRemarks}
              onChange={(e) => setPrintPrefs((prev) => ({ ...prev, showRemarks: e.target.checked }))}
            />
            Show remarks
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={printPrefs.showSignatureBlock}
              onChange={(e) => setPrintPrefs((prev) => ({ ...prev, showSignatureBlock: e.target.checked }))}
            />
            Show signatures
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={printPrefs.showFooter}
              onChange={(e) => setPrintPrefs((prev) => ({ ...prev, showFooter: e.target.checked }))}
            />
            Show footer
          </label>
        </div>
      </div>

      <article className="qp-sheet">
        {printPrefs.showWatermark && <div className={`qp-watermark ${watermarkClass}`}>{watermarkText}</div>}
        <header className="qp-header">
          <div className="qp-header-left">
            {printPrefs.showLogo && (
              <div className="qp-logo-wrap">
                {settings?.logo ? (
                  <img src={resolveAssetUrl(settings.logo)} alt={`${tenantName} logo`} className="qp-logo" />
                ) : (
                  <div className="qp-logo-fallback">{tenantName.slice(0, 1).toUpperCase()}</div>
                )}
              </div>
            )}
            <div>
              <h1 className="qp-tenant-name">{tenantName}</h1>
              <p className="qp-tenant-meta">{tenantAddress}</p>
              <p className="qp-tenant-meta">Company Code: {settings?.company_code ?? "-"}</p>
            </div>
          </div>
          <div className="qp-header-right">
            <div className="qp-doc-title">SALES ORDER</div>
            <div className="qp-status">{order.status}</div>
          </div>
        </header>

        <section className="qp-meta-grid">
          <div><span>Order No</span><strong>{order.order_code}</strong></div>
          <div><span>Customer</span><strong>{customer?.name ?? `#${order.customer_id}`}</strong></div>
          <div><span>Linked Quotation</span><strong>{quotation?.quotation_code ?? "-"}</strong></div>
          <div><span>Style</span><strong>{styleName}</strong></div>
          <div><span>Order Date</span><strong>{formatDate(order.order_date)}</strong></div>
          <div><span>Delivery Date</span><strong>{formatDate(order.delivery_date)}</strong></div>
          <div><span>Quantity</span><strong>{order.quantity != null ? order.quantity.toLocaleString() : "-"}</strong></div>
          <div><span>Shipping</span><strong>{shippingTerm}</strong></div>
          <div><span>Intermediary</span><strong>{intermediary}</strong></div>
          <div><span>Commission</span><strong>{commissionMode} / {commissionType} / {commissionValue}</strong></div>
          <div><span>Created</span><strong>{formatDateTime(order.created_at)}</strong></div>
          <div><span>Updated</span><strong>{formatDateTime(order.updated_at)}</strong></div>
        </section>

        <section className="qp-kpi-grid">
          <div className="qp-kpi qp-kpi-blue">
            <span>Status</span>
            <strong>{order.status}</strong>
          </div>
          <div className="qp-kpi qp-kpi-violet">
            <span>Quantity</span>
            <strong>{order.quantity != null ? order.quantity.toLocaleString() : "0"}</strong>
          </div>
          <div className="qp-kpi qp-kpi-amber">
            <span>Delivery Date</span>
            <strong>{formatDate(order.delivery_date)}</strong>
          </div>
          <div className="qp-kpi qp-kpi-emerald">
            <span>Shipping Term</span>
            <strong>{shippingTerm}</strong>
          </div>
        </section>

        {printPrefs.showStylePreview && (
          <section className="qp-section">
            <h2>Style Preview</h2>
            <table>
              <tbody>
                <tr>
                  <td style={{ width: "110px" }}>
                    {styleImage ? (
                      <img
                        src={resolveAssetUrl(styleImage)}
                        alt={styleName}
                        style={{ width: "92px", height: "92px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                      />
                    ) : (
                      <div style={{ width: "92px", height: "92px", borderRadius: "8px", border: "1px solid #cbd5e1", display: "grid", placeItems: "center", color: "#64748b" }}>
                        No image
                      </div>
                    )}
                  </td>
                  <td>
                    <div><strong>Style:</strong> {styleName}</div>
                    <div><strong>Reference:</strong> {order.style_ref ?? quotation?.style_ref ?? "-"}</div>
                    <div><strong>Customer:</strong> {customer?.name ?? `#${order.customer_id}`}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {printPrefs.showRemarks && (
          <section className="qp-notes">
            <h3>Order Remarks</h3>
            <p>{order.remarks || "No remarks added."}</p>
          </section>
        )}

        {printPrefs.showSignatureBlock && (
          <section className="qp-section">
            <h2>Approval Signatures</h2>
            <div className="grid grid-cols-3 gap-6 px-3 pt-6 pb-2 text-[10px] text-slate-700">
              <div className="text-center">
                <div className="border-t border-slate-400 pt-1">Prepared By</div>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-400 pt-1">Checked By</div>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-400 pt-1">Approved By</div>
              </div>
            </div>
          </section>
        )}

        {printPrefs.showFooter && (
          <footer className="qp-footer">
            <div className="qp-footer-left">
              <strong>Confidential:</strong> This order print is intended only for authorized users and process teams.
            </div>
            <div className="qp-footer-right">
              <div>Generated: {formatDateTime(generatedAt)}</div>
              <div>Generated by: {generatedBy}</div>
              <div>Order: {order.order_code}</div>
              <div className="qp-page-number" />
            </div>
          </footer>
        )}
      </article>
    </div>
  );
}
