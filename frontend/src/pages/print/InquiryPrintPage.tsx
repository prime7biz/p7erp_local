import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type CustomerResponse, type InquiryResponse, type SettingsConfigResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/quotation-print.css";

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function formatMoney(value: string | number | null | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

export function InquiryPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const generatedAt = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inquiry, setInquiry] = useState<InquiryResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);

  useEffect(() => {
    const inquiryId = Number(id);
    if (!Number.isFinite(inquiryId) || inquiryId <= 0) {
      setError("Invalid inquiry id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const inq = await api.getInquiry(inquiryId);
        const [cust, cfg] = await Promise.all([
          api.getCustomer(inq.customer_id).catch(() => null),
          api.getSettingsConfig().catch(() => null),
        ]);
        setInquiry(inq);
        setCustomer(cust);
        setSettings(cfg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load inquiry print view.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  if (loading) return <div className="min-h-[40vh] p-6 text-sm text-slate-600">Preparing print template...</div>;
  if (error || !inquiry) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "Inquiry not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/inquiries")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to inquiries
        </button>
      </div>
    );
  }

  const generatedBy = me?.first_name || me?.last_name
    ? `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim()
    : me?.username || me?.email || "System";
  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const tenantAddress = settings?.domain ? `Domain: ${settings.domain}` : "Address not configured in settings";
  const itemCount = inquiry.items.length;
  const watermarkText = ["WON", "APPROVED"].includes((inquiry.status || "").toUpperCase()) ? "Final" : "Draft";
  const watermarkClass = watermarkText === "Final" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Printable inquiry summary</div>
        <div className="qp-toolbar-actions">
          <Link
            to={`/app/inquiries/${inquiry.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to inquiry
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

      <article className="qp-sheet">
        <div className={`qp-watermark ${watermarkClass}`}>{watermarkText}</div>
        <header className="qp-header">
          <div className="qp-header-left">
            <div className="qp-logo-wrap">
              {settings?.logo ? (
                <img src={resolveAssetUrl(settings.logo)} alt={`${tenantName} logo`} className="qp-logo" />
              ) : (
                <div className="qp-logo-fallback">{tenantName.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div>
              <h1 className="qp-tenant-name">{tenantName}</h1>
              <p className="qp-tenant-meta">{tenantAddress}</p>
              <p className="qp-tenant-meta">Company Code: {settings?.company_code ?? "-"}</p>
            </div>
          </div>
          <div className="qp-header-right">
            <div className="qp-doc-title">INQUIRY</div>
            <div className="qp-status">{inquiry.status}</div>
          </div>
        </header>

        <section className="qp-meta-grid">
          <div><span>Inquiry No</span><strong>{inquiry.inquiry_code}</strong></div>
          <div><span>Customer</span><strong>{customer?.name ?? `#${inquiry.customer_id}`}</strong></div>
          <div><span>Style</span><strong>{inquiry.style_name ?? inquiry.style_ref ?? "-"}</strong></div>
          <div><span>Department</span><strong>{inquiry.department ?? "-"}</strong></div>
          <div><span>Season</span><strong>{inquiry.season ?? "-"}</strong></div>
          <div><span>Quantity</span><strong>{inquiry.quantity != null ? inquiry.quantity.toLocaleString() : "-"}</strong></div>
          <div><span>Target Price</span><strong>{formatMoney(inquiry.target_price)} USD</strong></div>
          <div><span>Intermediary</span><strong>{inquiry.intermediary_name ?? "-"}</strong></div>
          <div><span>Shipping</span><strong>{inquiry.shipping_term ?? "-"}</strong></div>
          <div><span>Commission</span><strong>{inquiry.commission_mode ?? "-"} / {inquiry.commission_type ?? "-"} / {inquiry.commission_value ?? "-"}</strong></div>
          <div><span>Created</span><strong>{formatDateTime(inquiry.created_at)}</strong></div>
          <div><span>Updated</span><strong>{formatDateTime(inquiry.updated_at)}</strong></div>
        </section>

        <section className="qp-kpi-grid">
          <div className="qp-kpi qp-kpi-blue">
            <span>Target Price</span>
            <strong>{formatMoney(inquiry.target_price)} USD</strong>
          </div>
          <div className="qp-kpi qp-kpi-violet">
            <span>Quantity</span>
            <strong>{inquiry.quantity != null ? inquiry.quantity.toLocaleString() : "0"}</strong>
          </div>
          <div className="qp-kpi qp-kpi-amber">
            <span>Items</span>
            <strong>{itemCount}</strong>
          </div>
          <div className="qp-kpi qp-kpi-emerald">
            <span>Commission</span>
            <strong>{formatMoney(inquiry.commission_value)}</strong>
          </div>
        </section>

        <section className="qp-section">
          <h2>Style Preview</h2>
          <table>
            <tbody>
              <tr>
                <td style={{ width: "110px" }}>
                  {inquiry.style_image_url ? (
                    <img
                      src={resolveAssetUrl(inquiry.style_image_url)}
                      alt={inquiry.style_name ?? inquiry.style_ref ?? "Style"}
                      style={{ width: "92px", height: "92px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  ) : (
                    <div style={{ width: "92px", height: "92px", borderRadius: "8px", border: "1px solid #cbd5e1", display: "grid", placeItems: "center", color: "#64748b" }}>
                      No image
                    </div>
                  )}
                </td>
                <td>
                  <div><strong>Style Name:</strong> {inquiry.style_name ?? "-"}</div>
                  <div><strong>Style Ref:</strong> {inquiry.style_ref ?? "-"}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="qp-section">
          <h2>Garment Items</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Description</th>
                <th className="right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {inquiry.items.length === 0 ? (
                <tr><td colSpan={4} className="empty">No garment items added.</td></tr>
              ) : (
                inquiry.items.map((line, index) => (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td>{line.item_name ?? "-"}</td>
                    <td>{line.description ?? "-"}</td>
                    <td className="right">{line.quantity != null ? line.quantity.toLocaleString() : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="qp-notes">
          <h3>Notes / Assumptions</h3>
          <p>{inquiry.notes || "No additional notes."}</p>
        </section>

        <footer className="qp-footer">
          <div className="qp-footer-left">
            <strong>Confidential:</strong> This inquiry summary is private and intended only for authorized users.
          </div>
          <div className="qp-footer-right">
            <div>Generated: {formatDateTime(generatedAt)}</div>
            <div>Generated by: {generatedBy}</div>
            <div>Inquiry: {inquiry.inquiry_code}</div>
            <div className="qp-page-number" />
          </div>
        </footer>
      </article>
    </div>
  );
}
