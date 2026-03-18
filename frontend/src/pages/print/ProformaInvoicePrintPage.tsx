import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, type ProformaInvoiceForPrint } from "@/api/client";
import "@/styles/quotation-print.css";

function formatMoney(value: string | number | null | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function ProformaInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProformaInvoiceForPrint | null>(null);

  const verificationUrl = useMemo(() => {
    if (!data?.verification_token) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/verify/proforma?token=${encodeURIComponent(data.verification_token)}`;
  }, [data?.verification_token]);

  useEffect(() => {
    const pid = id ? Number(id) : 0;
    if (!Number.isFinite(pid) || pid <= 0) {
      setError("Invalid proforma invoice id.");
      setLoading(false);
      return;
    }
    api
      .getProformaInvoiceForPrint(pid)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load proforma invoice."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-text-secondary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-sm">Preparing print template…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "Proforma invoice not found."}
        </div>
        <Link
          to="/app/commercial/proforma-invoices"
          className="inline-block rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
        >
          Back to proforma invoices
        </Link>
      </div>
    );
  }

  const tenantName = String(data.company_name ?? "Company");
  const logo = data.logo ?? null;
  const currency = String(data.currency ?? "USD");

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">
          <span className="font-medium text-text-secondary">Proforma Invoice – Print view</span>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <p className="hidden text-xs text-text-muted sm:block">
            Use <strong>Print</strong> or <strong>Save as PDF</strong> — in the dialog choose &quot;Save as PDF&quot; as destination to download.
          </p>
          <div className="qp-toolbar-actions flex gap-2">
            <Link
              to={`/app/commercial/proforma-invoices/${data.id}/edit`}
              className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
            >
              Back to edit
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              title="Open print dialog (choose printer or Save as PDF)"
            >
              Print
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-subtle"
              title="Open print dialog and select Save as PDF"
            >
              Save as PDF
            </button>
          </div>
        </div>
      </div>
      <p className="no-print mx-auto max-w-[210mm] text-center text-xs text-text-muted">
        Both buttons open the print dialog. Select &quot;Save as PDF&quot; or &quot;Microsoft Print to PDF&quot; to save the document.
      </p>

      <article className="qp-sheet qp-sheet-proforma">
        {/* QR code: top-right corner with "Scan to verify" */}
        {verificationUrl && (
          <div className="qp-qr-wrap">
            <div className="qp-qr-box">
              <QRCodeSVG value={verificationUrl} size={80} level="M" />
              <p className="qp-qr-label">Scan to verify</p>
            </div>
          </div>
        )}

        <header className="qp-header">
          <div className="qp-header-left">
            <div className="qp-logo-wrap">
              {logo ? (
                <img src={resolveAssetUrl(logo)} alt={`${tenantName} logo`} className="qp-logo" />
              ) : (
                <div className="qp-logo-fallback">{(tenantName || "C").slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div>
              <h1 className="qp-tenant-name">{tenantName}</h1>
              <p className="qp-tenant-meta">Proforma Invoice</p>
            </div>
          </div>
          <div className="qp-header-right">
            <div className="qp-doc-title">PROFORMA INVOICE</div>
            <div className="qp-status">{String(data.status ?? "—")}</div>
          </div>
        </header>

        <section className="qp-meta-grid">
          <div><span>Reference</span><strong>{data.reference ?? data.invoice_number ?? `#${data.id}`}</strong></div>
          <div><span>Invoice date</span><strong>{formatDate(data.invoice_date)}</strong></div>
          <div><span>Currency</span><strong>{currency}</strong></div>
          <div><span>Amount</span><strong>{formatMoney(data.amount)} {currency}</strong></div>
        </section>

        <section className="qp-section">
          <h2>Buyer</h2>
          <div className="qp-meta-grid">
            <div><span>Name</span><strong>{data.buyer_name ?? "—"}</strong></div>
            <div className="col-span-full"><span>Address</span><strong className="whitespace-pre-wrap">{data.buyer_address ?? "—"}</strong></div>
            {data.buyer_bank_details && (
              <div className="col-span-full"><span>Bank details</span><strong className="whitespace-pre-wrap">{data.buyer_bank_details}</strong></div>
            )}
          </div>
        </section>

        <section className="qp-section">
          <h2>Consignee</h2>
          <p><strong>{data.consignee_name ?? "—"}</strong></p>
          <p className="whitespace-pre-wrap text-text-secondary">{data.consignee_address ?? "—"}</p>
        </section>

        <section className="qp-section">
          <h2>Notify party</h2>
          <p><strong>{data.notify_party_name ?? "—"}</strong></p>
          <p className="whitespace-pre-wrap text-text-secondary">{data.notify_party_address ?? "—"}</p>
        </section>

        <section className="qp-section">
          <h2>Beneficiary / Shipper</h2>
          <p><strong>{data.beneficiary_name ?? "—"}</strong></p>
          <p className="whitespace-pre-wrap text-text-secondary">{data.beneficiary_address ?? "—"}</p>
        </section>

        <section className="qp-section">
          <h2>Orders</h2>
          <table>
            <thead>
              <tr>
                <th>Order code</th>
                <th>Style ref</th>
                <th className="right">Quantity</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.orders ?? []).length === 0 ? (
                <tr><td colSpan={4} className="empty">No orders.</td></tr>
              ) : (
                (data.orders ?? []).map((o) => (
                  <tr key={o.id}>
                    <td>{o.order_code}</td>
                    <td>{o.style_ref ?? "—"}</td>
                    <td className="right">{o.quantity != null ? Number(o.quantity).toLocaleString() : "—"}</td>
                    <td className="right">{formatMoney(o.amount)} {currency}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="qp-section">
          <h2>Shipping terms</h2>
          <div className="qp-meta-grid">
            <div><span>Terms of shipping</span><strong>{data.terms_of_shipping ?? "—"}</strong></div>
            <div><span>Terms of payment</span><strong>{data.terms_of_payment ?? "—"}</strong></div>
            <div><span>Shipping country</span><strong>{data.shipping_country ?? "—"}</strong></div>
            <div><span>Destination port / airport</span><strong>{data.destination_port_or_airport ?? "—"}</strong></div>
            <div><span>Shipment port</span><strong>{data.shipment_port ?? "—"}</strong></div>
          </div>
        </section>

        {(data.documents_to_provide ?? []).length > 0 && (
          <section className="qp-section">
            <h2>Documents to be provided</h2>
            <ul className="list-disc list-inside">
              {data.documents_to_provide!.map((doc, i) => (
                <li key={i}>{doc}</li>
              ))}
            </ul>
          </section>
        )}

        {(data.terms_and_conditions ?? []).filter(Boolean).length > 0 && (
          <section className="qp-section">
            <h2>Terms and conditions</h2>
            <ul className="list-disc list-inside">
              {data.terms_and_conditions!.filter(Boolean).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        )}

        {data.shipper_bank && (
          <section className="qp-section">
            <h2>Shipper bank</h2>
            <div className="qp-meta-grid">
              {data.shipper_bank.account_number && <div><span>Account number</span><strong>{data.shipper_bank.account_number}</strong></div>}
              {data.shipper_bank.branch && <div><span>Branch</span><strong>{data.shipper_bank.branch}</strong></div>}
              {data.shipper_bank.bank_name && <div><span>Bank name</span><strong>{data.shipper_bank.bank_name}</strong></div>}
              {data.shipper_bank.account_name && <div><span>Account name</span><strong>{data.shipper_bank.account_name}</strong></div>}
              {data.shipper_bank.bank_address && <div className="col-span-full"><span>Bank address</span><strong>{data.shipper_bank.bank_address}</strong></div>}
              {data.shipper_bank.swift_code && <div><span>SWIFT</span><strong>{data.shipper_bank.swift_code}</strong></div>}
            </div>
          </section>
        )}

        {/* QR code on print: bottom-right corner */}
        {verificationUrl && (
          <div className="qp-qr-print">
            <div className="qp-qr-box">
              <QRCodeSVG value={verificationUrl} size={72} level="M" />
              <p className="qp-qr-label">Scan to verify</p>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
