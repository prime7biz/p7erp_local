import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, type CustomerResponse, type InquiryResponse, type QuotationDetailResponse, type SettingsConfigResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
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

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const generatedAt = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quotation, setQuotation] = useState<QuotationDetailResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [inquiry, setInquiry] = useState<InquiryResponse | null>(null);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);

  useEffect(() => {
    const quotationId = Number(id);
    if (!Number.isFinite(quotationId) || quotationId <= 0) {
      setError("Invalid quotation id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const q = await api.getQuotation(quotationId);
        setQuotation(q);

        const [cfg, cust, inq] = await Promise.all([
          api.getSettingsConfig().catch(() => null),
          api.getCustomer(q.customer_id).catch(() => null),
          q.inquiry_id ? api.getInquiry(q.inquiry_id).catch(() => null) : Promise.resolve(null),
        ]);
        setSettings(cfg);
        setCustomer(cust);
        setInquiry(inq);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load printable quotation.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  if (loading) {
    return <div className="min-h-[40vh] p-6 text-sm text-slate-600">Preparing print template...</div>;
  }

  if (error || !quotation) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "Quotation not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/quotations")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to quotations
        </button>
      </div>
    );
  }

  const generatedBy = me?.first_name || me?.last_name
    ? `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim()
    : me?.username || me?.email || "System";
  const currency = quotation.currency ?? "USD";
  const totalQty = quotation.size_ratios.reduce((acc, row) => acc + (row.quantity ?? 0), 0);
  const fobCost = Number(quotation.total_cost ?? 0);
  const quotedPrice = Number(quotation.quoted_price ?? quotation.total_amount ?? 0);
  const marginAmount = quotedPrice - fobCost;
  const marginPct = fobCost ? (marginAmount / fobCost) * 100 : 0;
  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const tenantAddress = settings?.domain ? `Domain: ${settings.domain}` : "Address not configured in settings";
  const projectedQtyValue = quotation.projected_quantity ?? totalQty;
  const materialTotal = quotation.materials.reduce((acc, line) => acc + Number(line.total_amount ?? 0), 0);
  const manufacturingTotal = quotation.manufacturing.reduce((acc, line) => acc + Number(line.total_order_cost ?? 0), 0);
  const otherTotal = quotation.other_costs.reduce((acc, line) => acc + Number(line.calculated_amount || line.total_amount || 0), 0);
  const commissionAmount = Number(quotation.commission_value ?? 0);
  const breakdownRows = [
    { label: "Materials", value: materialTotal },
    { label: "Manufacturing", value: manufacturingTotal },
    { label: "Other Costs", value: otherTotal },
    { label: "Commission", value: commissionAmount },
  ];
  const breakdownBase = breakdownRows.reduce((acc, row) => acc + row.value, 0) || 1;
  const watermarkText = ["APPROVED", "SENT"].includes((quotation.status || "").toUpperCase()) ? "Final" : "Draft";
  const watermarkClass = watermarkText === "Final" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Printable quotation template</div>
        <div className="qp-toolbar-actions">
          <Link
            to={`/app/quotations/${quotation.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to quotation
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
            <div className="qp-doc-title">QUOTATION</div>
            <div className="qp-status">{quotation.status}</div>
          </div>
        </header>

        <section className="qp-meta-grid">
          <div><span>Quotation No</span><strong>{quotation.quotation_code}</strong></div>
          <div><span>Version</span><strong>{quotation.version_no}</strong></div>
          <div><span>Quotation Date</span><strong>{formatDate(quotation.quotation_date)}</strong></div>
          <div><span>Valid Until</span><strong>{formatDate(quotation.valid_until)}</strong></div>
          <div><span>Customer</span><strong>{customer?.name ?? `#${quotation.customer_id}`}</strong></div>
          <div><span>Inquiry</span><strong>{inquiry?.inquiry_code ?? "-"}</strong></div>
          <div><span>Style</span><strong>{quotation.style_name ?? quotation.style_ref ?? "-"}</strong></div>
          <div><span>Currency</span><strong>{currency}</strong></div>
          <div><span>Shipping</span><strong>{quotation.shipping_term ?? "-"}</strong></div>
          <div><span>Department</span><strong>{quotation.department ?? "-"}</strong></div>
          <div><span>Projected Qty</span><strong>{projectedQtyValue.toLocaleString()}</strong></div>
          <div><span>Commission</span><strong>{quotation.commission_mode ?? "-"} / {quotation.commission_type ?? "-"} / {quotation.commission_value ?? "-"}</strong></div>
        </section>

        <section className="qp-kpi-grid">
          <div className="qp-kpi qp-kpi-blue">
            <span>FOB Cost</span>
            <strong>{formatMoney(quotation.total_cost)} {currency}</strong>
          </div>
          <div className="qp-kpi qp-kpi-violet">
            <span>Quoted Price</span>
            <strong>{formatMoney(quotation.quoted_price ?? quotation.total_amount)} {currency}</strong>
          </div>
          <div className="qp-kpi qp-kpi-amber">
            <span>Margin</span>
            <strong>{formatMoney(marginAmount)} ({marginPct.toFixed(2)}%)</strong>
          </div>
          <div className="qp-kpi qp-kpi-emerald">
            <span>Total Qty</span>
            <strong>{projectedQtyValue.toLocaleString()}</strong>
          </div>
        </section>

        <section className="qp-section">
          <h2>Cost Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Head</th>
                <th className="right">Value</th>
                <th className="right">Share %</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="right">{formatMoney(row.value)} {currency}</td>
                  <td className="right">{((row.value / breakdownBase) * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="qp-section">
          <h2>Fabric Costs / Materials</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Description</th>
                <th className="right">Unit Price</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quotation.materials.length === 0 ? (
                <tr><td colSpan={5} className="empty">No material lines.</td></tr>
              ) : (
                quotation.materials.map((line) => (
                  <tr key={`mat-${line.id ?? line.serial_no}`}>
                    <td>{line.serial_no}</td>
                    <td>{line.category_id ?? "-"}</td>
                    <td>{line.description || "-"}</td>
                    <td className="right">{formatMoney(line.unit_price)}</td>
                    <td className="right">{formatMoney(line.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="qp-section">
          <h2>Labor / CM</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Style Part</th>
                <th className="right">Machines</th>
                <th className="right">CM / PC</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotation.manufacturing.length === 0 ? (
                <tr><td colSpan={5} className="empty">No manufacturing lines.</td></tr>
              ) : (
                quotation.manufacturing.map((line) => (
                  <tr key={`mfg-${line.id ?? line.serial_no}`}>
                    <td>{line.serial_no}</td>
                    <td>{line.style_part || "-"}</td>
                    <td className="right">{line.machines_required}</td>
                    <td className="right">{formatMoney(line.cm_per_piece)}</td>
                    <td className="right">{formatMoney(line.total_order_cost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="qp-section">
          <h2>Other Costs</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cost Head</th>
                <th>Type</th>
                <th className="right">Value</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quotation.other_costs.length === 0 ? (
                <tr><td colSpan={5} className="empty">No additional cost lines.</td></tr>
              ) : (
                quotation.other_costs.map((line) => (
                  <tr key={`other-${line.id ?? line.serial_no}`}>
                    <td>{line.serial_no}</td>
                    <td>{line.cost_head || "-"}</td>
                    <td>{line.cost_type || "-"}</td>
                    <td className="right">{formatMoney(line.value)}</td>
                    <td className="right">{formatMoney(line.calculated_amount || line.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="qp-notes">
          <h3>Notes / Assumptions</h3>
          <p>{quotation.notes || "No additional notes."}</p>
        </section>

        <footer className="qp-footer">
          <div className="qp-footer-left">
            <strong>Confidential:</strong> This quotation and costing breakdown are private and intended only for authorized use.
          </div>
          <div className="qp-footer-right">
            <div>Generated: {formatDateTime(generatedAt)}</div>
            <div>Generated by: {generatedBy}</div>
            <div>Quotation: {quotation.quotation_code}</div>
            <div className="qp-page-number" />
          </div>
        </footer>
      </article>
    </div>
  );
}
