import { QRCodeSVG } from "qrcode.react";
import "@/styles/voucher-print.css";
import type { VoucherPrintResponse } from "@/api/client";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const abs = Math.abs(n);
  const intPart = Math.floor(abs);
  const decPart = Math.round((abs - intPart) * 100);

  function convert(num: number): string {
    if (num < 20) return ONES[num] ?? "";
    if (num < 100) return (TENS[Math.floor(num / 10)] ?? "") + (num % 10 ? " " + (ONES[num % 10] ?? "") : "");
    if (num < 1000) return (ONES[Math.floor(num / 100)] ?? "") + " Hundred" + (num % 100 ? " and " + convert(num % 100) : "");
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
    if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convert(num % 100000) : "");
    return convert(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + convert(num % 10000000) : "");
  }

  let result = convert(intPart);
  if (decPart > 0) result += " and " + convert(decPart) + " Paisa";
  return (n < 0 ? "Minus " : "") + result + " Only";
}

type Props = {
  data: VoucherPrintResponse;
  copyCount: number;
  template: "standard" | "compact" | "audit";
  verificationUrl: string;
};

export function VoucherPrintSheets({ data, copyCount, template, verificationUrl }: Props) {
  const copyLabels = data.print_meta?.copy_labels ?? ["Original", "Duplicate", "Triplicate"];
  return (
    <>
      {Array.from({ length: copyCount }).map((_, copyIdx) => (
        <article key={copyIdx} className={`vp-sheet vp-template-${template}`}>
          <div className="vp-copy-badge">{copyLabels[copyIdx] ?? `Copy ${copyIdx + 1}`}</div>
          <header className="vp-company-header">
            <div className="vp-company-info">
              <h1 className="vp-company-name">{data.tenant.name}</h1>
              {data.tenant.domain ? <p className="vp-company-address">{data.tenant.domain}</p> : null}
              {data.tenant.company_code ? <p className="vp-company-address">Company Code: {data.tenant.company_code}</p> : null}
            </div>
            {verificationUrl ? (
              <div className="vp-qr-box">
                <QRCodeSVG value={verificationUrl} size={72} level="M" />
                <p className="vp-qr-label">Scan to Verify</p>
              </div>
            ) : null}
          </header>
          <div className="vp-voucher-title-bar">
            <span className="vp-voucher-type">{data.voucher.voucher_type} VOUCHER</span>
            <span className="vp-voucher-number">{data.voucher.voucher_number}</span>
          </div>
          <div className="vp-meta-grid">
            <div className="vp-meta-item">
              <span className="vp-meta-label">Date</span>
              <span className="vp-meta-value">{data.voucher.voucher_date}</span>
            </div>
            <div className="vp-meta-item">
              <span className="vp-meta-label">Status</span>
              <span className="vp-meta-value">{data.voucher.status}</span>
            </div>
            <div className="vp-meta-item">
              <span className="vp-meta-label">Currency</span>
              <span className="vp-meta-value">{data.voucher.currency}</span>
            </div>
            <div className="vp-meta-item">
              <span className="vp-meta-label">Base Currency</span>
              <span className="vp-meta-value">{data.voucher.base_currency}</span>
            </div>
            <div className="vp-meta-item">
              <span className="vp-meta-label">Exchange Rate</span>
              <span className="vp-meta-value">{data.voucher.exchange_rate}</span>
            </div>
            <div className="vp-meta-item">
              <span className="vp-meta-label">Reference</span>
              <span className="vp-meta-value">{data.voucher.reference ?? "—"}</span>
            </div>
            <div className="vp-meta-item vp-meta-wide">
              <span className="vp-meta-label">Narration</span>
              <span className="vp-meta-value">{data.voucher.description ?? "—"}</span>
            </div>
            <div className="vp-meta-item">
              <span className="vp-meta-label">Created By</span>
              <span className="vp-meta-value">{data.voucher.created_by_name || "—"}</span>
            </div>
          </div>
          <table className="vp-table">
            <thead>
              <tr>
                <th className="vp-th vp-th-sl">#</th>
                <th className="vp-th">Account Code</th>
                <th className="vp-th">Account Name</th>
                <th className="vp-th">Cost Center</th>
                <th className="vp-th">Cost nature</th>
                <th className="vp-th vp-th-right">Debit</th>
                <th className="vp-th vp-th-right">Credit</th>
                <th className="vp-th">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line, idx) => (
                <tr key={line.line_id}>
                  <td className="vp-td vp-td-center">{idx + 1}</td>
                  <td className="vp-td">{line.account_code}</td>
                  <td className="vp-td">{line.account_name}</td>
                  <td className="vp-td">{line.cost_center_name || "—"}</td>
                  <td className="vp-td">{line.cost_nature ?? "—"}</td>
                  <td className="vp-td vp-td-right">
                    {line.entry_type === "DEBIT" ? line.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                  </td>
                  <td className="vp-td vp-td-right">
                    {line.entry_type === "CREDIT" ? line.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                  </td>
                  <td className="vp-td">{line.notes || ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="vp-totals-row">
                <td className="vp-td" colSpan={5}>
                  <strong>Total</strong>
                </td>
                <td className="vp-td vp-td-right">
                  <strong>{data.totals.debit_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </td>
                <td className="vp-td vp-td-right">
                  <strong>{data.totals.credit_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </td>
                <td className="vp-td" />
              </tr>
            </tfoot>
          </table>
          <div className="vp-amount-words">
            <span className="vp-amount-words-label">Amount in Words:</span> {data.voucher.currency}{" "}
            {numberToWords(data.totals.debit_total)}
          </div>
          <div className={`vp-balance-badge ${data.totals.is_balanced ? "vp-balanced" : "vp-unbalanced"}`}>
            {data.totals.is_balanced ? "Balanced" : "Not Balanced"}
          </div>
          <div className="vp-signatures">
            {["Prepared By", "Checked By", "Recommended By", "Approved By", "Audited By"].map((label) => (
              <div key={label} className="vp-sig-block">
                <div className="vp-sig-line" />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="vp-footer">
            <p className="vp-verification-info">
              Verification ID: {data.voucher.verification_id ?? "N/A"}
              {data.voucher.signed_at ? ` | Signed: ${data.voucher.signed_at}` : ""}
            </p>
            <p className="vp-disclaimer">
              This is a system-generated document. The QR code above can be scanned to verify authenticity.
            </p>
            <p className="vp-print-time">Printed: {data.print_meta?.generated_at ?? new Date().toISOString()}</p>
          </div>
        </article>
      ))}
    </>
  );
}
