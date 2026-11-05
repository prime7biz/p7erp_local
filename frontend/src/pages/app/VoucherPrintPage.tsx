import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, type VoucherPrintResponse } from "@/api/client";
import { PrintOnlyPortal } from "@/components/print/PrintOnlyPortal";
import { VoucherPrintSheets } from "@/components/print/VoucherPrintSheets";
import { voucherPrintVerificationUrl } from "@/utils/verifyPrintUrl";
import "@/styles/voucher-print.css";

export function VoucherPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [voucherId, setVoucherId] = useState("");
  const [data, setData] = useState<VoucherPrintResponse | null>(null);
  const [error, setError] = useState("");
  const [copyCount, setCopyCount] = useState(3);
  const [template, setTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const queryVoucherId = searchParams.get("voucher_id");

  const verificationUrl = useMemo(() => voucherPrintVerificationUrl(data), [data]);

  async function loadById(id: number) {
    setError("");
    try {
      setData(await api.getVoucherPrint(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    const id = Number(queryVoucherId);
    if (Number.isFinite(id) && id > 0) {
      setVoucherId(String(id));
      void loadById(id);
    }
  }, [queryVoucherId]);

  return (
    <div className="vp-root">
      {/* Toolbar — hidden during print */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised p-4">
        <button
          type="button"
          className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
          onClick={() => navigate("/app/accounts/vouchers")}
        >
          &larr; Back to Voucher List
        </button>
        <div className="mx-2 h-6 w-px bg-border" />
        <input
          className="w-36 rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-brand-primary"
          placeholder="Voucher ID"
          value={voucherId}
          onChange={(e) => setVoucherId(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90"
          onClick={() => {
            const id = Number(voucherId);
            if (Number.isFinite(id) && id > 0) void loadById(id);
          }}
        >
          Load
        </button>
        <div className="mx-2 h-6 w-px bg-border" />
        <select className="rounded-lg border border-border-strong px-3 py-2 text-sm" value={template} onChange={(e) => setTemplate(e.target.value as "standard" | "compact" | "audit")}>
          <option value="standard">Standard Template</option>
          <option value="compact">Compact Template</option>
          <option value="audit">Audit Template</option>
        </select>
        <select className="rounded-lg border border-border-strong px-3 py-2 text-sm" value={copyCount} onChange={(e) => setCopyCount(Number(e.target.value))}>
          <option value={1}>1 Copy</option>
          <option value={2}>2 Copies</option>
          <option value={3}>3 Copies</option>
        </select>
        <div className="mx-2 h-6 w-px bg-border" />
        <button type="button" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle" onClick={() => window.print()}>
          Save as PDF
        </button>
      </div>

      {error ? <div className="no-print mb-4 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      {data ? (
        <>
          <div className="space-y-6">
            <VoucherPrintSheets data={data} copyCount={copyCount} template={template} verificationUrl={verificationUrl} />
          </div>
          <PrintOnlyPortal>
            <VoucherPrintSheets data={data} copyCount={copyCount} template={template} verificationUrl={verificationUrl} />
          </PrintOnlyPortal>
        </>
      ) : (
        <div className="no-print text-center text-sm text-text-muted py-16">
          Enter a voucher ID and click Load, or navigate here from the voucher list.
        </div>
      )}
    </div>
  );
}
