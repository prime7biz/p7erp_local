import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, type ItemCategoryResponse, type CustomerResponse, type InquiryResponse, type QuotationDetailResponse, type SettingsConfigResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { SecureImage } from "@/components/SecureImage";
import { PrintPdfToolbarActions } from "@/components/print/PrintPdfToolbarActions";
import { logApiError } from "@/utils/logApiError";
import { subtractMoney, sumMoneyBy } from "@/lib/money";
import { QRCodeSVG } from "qrcode.react";
import { publicVerifyUrl } from "@/utils/verifyPrintUrl";
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
  const [printPrefs, setPrintPrefs] = useState({
    showLogo: true,
    showWatermark: true,
    showStylePreview: true,
    showRemarks: true,
    showSignatureBlock: true,
    showFooter: true,
  });
  // Buyer Quotation hides internal costing (FOB cost, margin, shares, raw material prices).
  const [docMode, setDocMode] = useState<"buyer" | "internal">("buyer");
  const [categories, setCategories] = useState<ItemCategoryResponse[]>([]);
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

        const [cfg, cust, inq, cats] = await Promise.all([
          api.getSettingsConfig().catch((e) => {
            logApiError("QuotationPrintPage.getSettingsConfig", e);
            return null;
          }),
          api.getCustomer(q.customer_id).catch((e) => {
            logApiError("QuotationPrintPage.getCustomer", e);
            return null;
          }),
          q.inquiry_id
            ? api.getInquiry(q.inquiry_id).catch((e) => {
                logApiError("QuotationPrintPage.getInquiry", e);
                return null;
              })
            : Promise.resolve(null),
          api.listItemCategories().catch((e) => {
            logApiError("QuotationPrintPage.listItemCategories", e);
            return [] as ItemCategoryResponse[];
          }),
        ]);
        setCategories(cats);
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
    return <div className="min-h-[40vh] p-6 text-sm text-text-secondary">Preparing print template...</div>;
  }

  if (error || !quotation) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error || "Quotation not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/quotations")}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
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
  // Dozen-first quotations are costed per dozen and priced per piece; margin is shown on the dozen figures.
  const dozenFirst = quotation.costing_basis === "PER_DOZEN";
  const fobCost = Number((dozenFirst ? quotation.total_cost_per_dozen : quotation.total_cost) ?? 0);
  const quotedPrice = Number(
    (dozenFirst ? quotation.quoted_price_per_dozen : (quotation.quoted_price ?? quotation.total_amount)) ?? 0,
  );
  const marginAmount = subtractMoney(quotedPrice, fobCost);
  const marginPct = fobCost ? (marginAmount / fobCost) * 100 : 0;
  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const tenantAddress = settings?.domain ? `Domain: ${settings.domain}` : "Address not configured in settings";
  const projectedQtyValue = quotation.projected_quantity ?? totalQty;
  const materialTotal = sumMoneyBy(quotation.materials, (line) => line.total_amount);
  const manufacturingTotal = sumMoneyBy(quotation.manufacturing, (line) => line.total_order_cost);
  const otherTotal = sumMoneyBy(quotation.other_costs, (line) => line.calculated_amount || line.total_amount || 0);
  const commissionAmount = Number(quotation.commission_value ?? 0);
  const breakdownRows = [
    { label: "Materials", value: materialTotal },
    { label: "Manufacturing", value: manufacturingTotal },
    { label: "Other Costs", value: otherTotal },
    { label: "Commission", value: commissionAmount },
  ];
  const breakdownBase = sumMoneyBy(breakdownRows, (row) => row.value) || 1;
  const isBuyer = docMode === "buyer";
  const verifyUrl = publicVerifyUrl(quotation.verification_id);
  const categoryName = (categoryId: number | null | undefined) =>
    categoryId == null ? "-" : categories.find((c) => c.id === categoryId)?.name ?? `#${categoryId}`;
  const unitQuotedPrice = dozenFirst
    ? Number(quotation.quoted_price_per_piece ?? 0)
    : projectedQtyValue > 0
      ? quotedPrice / projectedQtyValue
      : 0;
  const orderTotalText =
    dozenFirst && !(Number(projectedQtyValue) > 0)
      ? "Quantity not set"
      : `${formatMoney(quotation.quoted_price ?? quotation.total_amount)} ${currency}`;
  const watermarkText = ["APPROVED", "SENT", "CONVERTED"].includes((quotation.status || "").toUpperCase()) ? "Final" : "Draft";
  const watermarkClass = watermarkText === "Final" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Printable quotation template</div>
        <div className="qp-toolbar-actions">
          <Link
            to={`/app/quotations/${quotation.id}`}
            className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Back to quotation
          </Link>
          <PrintPdfToolbarActions
            downloadPdf={() => api.downloadQuotationPdf(quotation.id)}
            filename={`${quotation.quotation_code || `quotation-${quotation.id}`}.pdf`}
            logKey="QuotationPrintPage.pdf"
          />
        </div>
      </div>
      <div className="no-print mx-auto mb-3 w-full max-w-[210mm] rounded-xl border border-brand-primary/25 bg-brand-primary/10 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-brand-primary">Print template settings</div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-brand-primary" htmlFor="qp-doc-mode">
              Document mode
            </label>
            <select
              id="qp-doc-mode"
              value={docMode}
              onChange={(e) => setDocMode(e.target.value as "buyer" | "internal")}
              className="rounded-md border border-brand-primary/30 bg-surface-raised px-2 py-1 text-xs text-brand-primary"
            >
              <option value="buyer">Buyer Quotation</option>
              <option value="internal">Internal Costing Sheet</option>
            </select>
            <select
              value={templatePreset}
              onChange={(e) => applyPreset(e.target.value as "standard" | "minimal" | "factory")}
              className="rounded-md border border-brand-primary/30 bg-surface-raised px-2 py-1 text-xs text-brand-primary"
            >
              <option value="standard">Standard</option>
              <option value="minimal">Minimal</option>
              <option value="factory">Factory Copy</option>
            </select>
            <button
              type="button"
              onClick={() => applyPreset("standard")}
              className="rounded-md border border-brand-primary/30 bg-surface-raised px-2 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/10"
            >
              Reset default
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-brand-primary md:grid-cols-3">
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
                  <SecureImage url={settings.logo} alt={`${tenantName} logo`} className="qp-logo" />
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
            <div className="qp-doc-title">{isBuyer ? "QUOTATION" : "INTERNAL COSTING SHEET"}</div>
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
          {!isBuyer && (
            <div><span>Commission</span><strong>{quotation.commission_mode ?? "-"} / {quotation.commission_type ?? "-"} / {quotation.commission_value ?? "-"}</strong></div>
          )}
        </section>

        <section className="qp-kpi-grid">
          {!isBuyer && (
            <div className="qp-kpi qp-kpi-blue">
              <span>{dozenFirst ? "FOB Cost / dozen" : "FOB Cost"}</span>
              <strong>{formatMoney(dozenFirst ? quotation.total_cost_per_dozen : quotation.total_cost)} {currency}</strong>
            </div>
          )}
          {isBuyer && (
            <div className="qp-kpi qp-kpi-blue">
              <span>Unit Quoted Price</span>
              <strong>{dozenFirst ? unitQuotedPrice.toFixed(4) : formatMoney(unitQuotedPrice)} {currency}</strong>
            </div>
          )}
          <div className="qp-kpi qp-kpi-violet">
            <span>{isBuyer ? "Total Quoted" : "Quoted Price"}</span>
            <strong>{orderTotalText}</strong>
          </div>
          {dozenFirst && !isBuyer && (
            <div className="qp-kpi qp-kpi-blue">
              <span>Price / piece · dozen</span>
              <strong>{unitQuotedPrice.toFixed(4)} · {formatMoney(quotation.quoted_price_per_dozen)} {currency}</strong>
            </div>
          )}
          {!isBuyer && (
            <div className="qp-kpi qp-kpi-amber">
              <span>Margin</span>
              <strong>{formatMoney(marginAmount)} ({marginPct.toFixed(2)}%)</strong>
            </div>
          )}
          <div className="qp-kpi qp-kpi-emerald">
            <span>Total Qty</span>
            <strong>{projectedQtyValue.toLocaleString()}</strong>
          </div>
        </section>

        {printPrefs.showStylePreview && (
          <section className="qp-section">
            <h2>Style Preview</h2>
            <table>
              <tbody>
                <tr>
                  <td style={{ width: "110px" }}>
                    {quotation.style_image_url ? (
                      <SecureImage
                        url={quotation.style_image_url}
                        alt={quotation.style_name ?? quotation.style_ref ?? "Style"}
                        style={{ width: "92px", height: "92px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                      />
                    ) : (
                      <div style={{ width: "92px", height: "92px", borderRadius: "8px", border: "1px solid #cbd5e1", display: "grid", placeItems: "center", color: "#64748b" }}>
                        No image
                      </div>
                    )}
                  </td>
                  <td>
                    <div><strong>Style:</strong> {quotation.style_name ?? quotation.style_ref ?? "-"}</div>
                    <div><strong>Reference:</strong> {quotation.style_ref ?? "-"}</div>
                    <div><strong>Customer:</strong> {customer?.name ?? `#${quotation.customer_id}`}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section className="qp-section">
          <h2>Size Ratio</h2>
          <table>
            <thead>
              <tr>
                <th>Size</th>
                <th className="right">Ratio %</th>
                <th className="right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {quotation.size_ratios.length === 0 ? (
                <tr><td colSpan={3} className="empty">No size ratio lines.</td></tr>
              ) : (
                quotation.size_ratios.map((row, i) => (
                  <tr key={`size-${i}`}>
                    <td>{row.size}</td>
                    <td className="right">{row.ratio_percentage}</td>
                    <td className="right">{(row.quantity ?? 0).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {!isBuyer && (
        <>
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
                    <td>{categoryName(line.category_id)}</td>
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
        </>
        )}

        {printPrefs.showRemarks && (
          <section className="qp-notes">
            <h3>Notes / Assumptions</h3>
            <p>{quotation.notes || "No additional notes."}</p>
          </section>
        )}

        {isBuyer && verifyUrl ? (
          <section className="qp-section" aria-label="Quotation verification">
            <div className="flex items-center gap-3 px-3 py-2">
              <QRCodeSVG value={verifyUrl} size={80} level="M" />
              <div className="text-[10px] text-text-secondary">
                <div className="font-semibold">Scan to verify this quotation</div>
                <div>{quotation.verification_id}</div>
              </div>
            </div>
          </section>
        ) : null}

        {printPrefs.showSignatureBlock && (
          <section className="qp-section">
            <h2>Approval Signatures</h2>
            <div className="grid grid-cols-3 gap-6 px-3 pt-6 pb-2 text-[10px] text-text-secondary">
              <div className="text-center">
                <div className="border-t border-border pt-1">Prepared By</div>
              </div>
              <div className="text-center">
                <div className="border-t border-border pt-1">Checked By</div>
              </div>
              <div className="text-center">
                <div className="border-t border-border pt-1">Approved By</div>
              </div>
            </div>
          </section>
        )}

        {printPrefs.showFooter && (
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
        )}
      </article>
    </div>
  );
}
