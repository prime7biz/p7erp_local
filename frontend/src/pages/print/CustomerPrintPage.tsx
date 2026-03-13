import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type CustomerResponse, type SettingsConfigResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/quotation-print.css";

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : "-";
}

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export function CustomerPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const generatedAt = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);

  useEffect(() => {
    const customerId = Number(id);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [cust, cfg] = await Promise.all([
          api.getCustomer(customerId),
          api.getSettingsConfig().catch(() => null),
        ]);
        setCustomer(cust);
        setSettings(cfg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load customer print view.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  if (loading) return <div className="min-h-[40vh] p-6 text-sm text-slate-600">Preparing print template...</div>;
  if (error || !customer) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "Customer not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/customers")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to customers
        </button>
      </div>
    );
  }

  const generatedBy = me?.first_name || me?.last_name
    ? `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim()
    : me?.username || me?.email || "System";
  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const tenantAddress = settings?.domain ? `Domain: ${settings.domain}` : "Address not configured in settings";
  const billingAddress = [customer.billing_address_line1, customer.billing_city, customer.billing_postal_code, customer.billing_country]
    .filter(Boolean)
    .join(", ");
  const shippingAddress = [customer.shipping_address_line1, customer.shipping_city, customer.shipping_postal_code, customer.shipping_country]
    .filter(Boolean)
    .join(", ");
  const isActive = (customer.status || "active").toLowerCase() === "active";
  const watermarkText = isActive ? "Final" : "Draft";
  const watermarkClass = watermarkText === "Final" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Printable customer profile</div>
        <div className="qp-toolbar-actions">
          <Link
            to={`/app/customers/${customer.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to customer
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
            <div className="qp-doc-title">CUSTOMER PROFILE</div>
            <div className="qp-status">{(customer.status || "active").toUpperCase()}</div>
          </div>
        </header>

        <section className="qp-meta-grid">
          <div><span>Customer Name</span><strong>{customer.name}</strong></div>
          <div><span>Customer Code</span><strong>{customer.customer_code}</strong></div>
          <div><span>Customer Type</span><strong>{orDash(customer.customer_type)}</strong></div>
          <div><span>Trade Name</span><strong>{orDash(customer.trade_name)}</strong></div>
          <div><span>Legal Entity</span><strong>{orDash(customer.legal_entity_name)}</strong></div>
          <div><span>Tax / VAT</span><strong>{orDash(customer.tax_id_vat_number)}</strong></div>
          <div><span>Website</span><strong>{orDash(customer.website)}</strong></div>
          <div><span>Country</span><strong>{orDash(customer.billing_country ?? customer.country)}</strong></div>
          <div><span>Primary Contact</span><strong>{orDash(customer.primary_contact_name)}</strong></div>
          <div><span>Designation</span><strong>{orDash(customer.designation)}</strong></div>
          <div><span>Email</span><strong>{orDash(customer.contact_email ?? customer.email)}</strong></div>
          <div><span>Phone</span><strong>{orDash(customer.contact_phone ?? customer.phone)}</strong></div>
        </section>

        <section className="qp-kpi-grid">
          <div className="qp-kpi qp-kpi-blue">
            <span>Status</span>
            <strong>{isActive ? "Active" : "Inactive"}</strong>
          </div>
          <div className="qp-kpi qp-kpi-violet">
            <span>Newsletter</span>
            <strong>{customer.subscribe_newsletter ? "Subscribed" : "No"}</strong>
          </div>
          <div className="qp-kpi qp-kpi-amber">
            <span>Billing Country</span>
            <strong>{orDash(customer.billing_country ?? customer.country)}</strong>
          </div>
          <div className="qp-kpi qp-kpi-emerald">
            <span>Address Match</span>
            <strong>{customer.same_as_billing ? "Same as billing" : "Separate"}</strong>
          </div>
        </section>

        <section className="qp-section">
          <h2>Address Information</h2>
          <table>
            <thead>
              <tr>
                <th>Address Type</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Billing</td>
                <td>{billingAddress || "No billing address provided."}</td>
              </tr>
              <tr>
                <td>Shipping</td>
                <td>{shippingAddress || "No shipping address provided."}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="qp-notes">
          <h3>Internal Notes</h3>
          <p>{customer.address || "No additional notes."}</p>
        </section>

        <footer className="qp-footer">
          <div className="qp-footer-left">
            <strong>Confidential:</strong> This customer profile is private and intended only for authorized users.
          </div>
          <div className="qp-footer-right">
            <div>Generated: {formatDateTime(generatedAt)}</div>
            <div>Generated by: {generatedBy}</div>
            <div>Customer: {customer.customer_code}</div>
            <div className="qp-page-number" />
          </div>
        </footer>
      </article>
    </div>
  );
}
