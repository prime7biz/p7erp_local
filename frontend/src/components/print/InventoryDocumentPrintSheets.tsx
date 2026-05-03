import { QRCodeSVG } from "qrcode.react";
import "@/styles/voucher-print.css";
import type { InventoryDocumentPrintPayload } from "@/api/client";
import { inventoryPrintVerifyUrl } from "@/utils/verifyPrintUrl";

type Props = {
  data: InventoryDocumentPrintPayload;
  copyCount: number;
  template: "standard" | "compact" | "audit";
};

export function InventoryDocumentPrintSheets({ data, copyCount, template }: Props) {
  const verifyUrl = inventoryPrintVerifyUrl(data);
  const copyLabels = data.print_meta?.copy_labels ?? ["Original", "Duplicate", "Triplicate"];
  const title = (data.print_meta?.title as string) || data.document_type.replace(/_/g, " ");
  const doc = data.document;
  const metaEntries = Object.entries(doc).filter(
    ([k, v]) =>
      !["verification_id", "signature_hash", "signed_at", "id"].includes(k) && v != null && v !== "",
  );

  const lineKeys =
    data.lines.length > 0
      ? Array.from(
          new Set(
            data.lines.flatMap((row) => Object.keys(row as Record<string, unknown>)),
          ),
        )
      : [];

  return (
    <>
      {Array.from({ length: copyCount }).map((_, copyIdx) => (
        <article key={copyIdx} className={`vp-sheet vp-template-${template}`}>
          <div className="vp-copy-badge">{copyLabels[copyIdx] ?? `Copy ${copyIdx + 1}`}</div>
          <header className="vp-company-header">
            <div className="vp-company-info">
              <h1 className="vp-company-name">{data.tenant.name}</h1>
              {data.tenant.domain ? <p className="vp-company-address">{data.tenant.domain}</p> : null}
              {data.tenant.company_code ? (
                <p className="vp-company-address">Company Code: {data.tenant.company_code}</p>
              ) : null}
              {data.tenant.address ? <p className="vp-company-address">{data.tenant.address}</p> : null}
            </div>
            {verifyUrl ? (
              <div className="vp-qr-box">
                <QRCodeSVG value={verifyUrl} size={80} level="M" />
                <p className="vp-qr-label">Scan to verify</p>
              </div>
            ) : null}
          </header>

          <div className="vp-voucher-title-bar">
            <span className="vp-voucher-type">{title}</span>
            <span className="vp-voucher-number">
              {(doc.challan_code as string) ||
                (doc.gate_pass_code as string) ||
                (doc.grn_code as string) ||
                (doc.issue_code as string) ||
                (doc.process_number as string) ||
                (doc.transfer_code as string) ||
                `#${doc.id}`}
            </span>
          </div>

          <div className="vp-meta-grid">
            {metaEntries.map(([k, v]) => (
              <div key={k} className={`vp-meta-item ${k.length > 12 ? "vp-meta-wide" : ""}`}>
                <span className="vp-meta-label">
                  {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="vp-meta-value">{String(v)}</span>
              </div>
            ))}
          </div>

          {data.lines.length > 0 && lineKeys.length > 0 ? (
            <table className="vp-table">
              <thead>
                <tr>
                  <th className="vp-th vp-th-sl">#</th>
                  {lineKeys.map((col) => (
                    <th key={col} className="vp-th">
                      {col.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lines.map((row, idx) => (
                  <tr key={idx}>
                    <td className="vp-td vp-td-center">{idx + 1}</td>
                    {lineKeys.map((col) => (
                      <td key={col} className="vp-td">
                        {String((row as Record<string, unknown>)[col] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="vp-signatures">
            {["Prepared", "Checked", "Security", "Approved"].map((label) => (
              <div key={label} className="vp-sig-block">
                <div className="vp-sig-line" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="vp-footer">
            <p className="vp-verification-info">
              Verification ID: {(doc.verification_id as string) ?? "N/A"}
              {doc.signed_at ? ` | Signed: ${String(doc.signed_at)}` : ""}
            </p>
            <p className="vp-disclaimer">
              System-generated document. Scan the QR code to verify authenticity. Confidential.
            </p>
            <p className="vp-print-time">
              Printed: {data.print_meta?.generated_at ?? new Date().toISOString()}
            </p>
          </div>
        </article>
      ))}
    </>
  );
}
