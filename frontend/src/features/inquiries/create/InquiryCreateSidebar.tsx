import type { StyleResponse } from "@/api/client";
import { formatMoney, toSafeNumber } from "@/features/quotations/workspace/mappers/quotationNumeric";
import { useSecureImage } from "@/hooks/useSecureImage";

interface InquiryCreateSidebarProps {
  isEdit: boolean;
  inquiryCode: string;
  customerName: string;
  selectedStyle: StyleResponse | null;
  garmentLineCount: number;
  expectedQuantity?: number;
  targetPrice?: string | number | null;
  targetPriceCurrency?: string;
  currency?: string;
  exchangeRate?: string | number | null;
  rateSource: "" | "live" | "fallback";
  shippingTerm?: string;
  intermediaryLabel: string;
  commissionMode?: string;
  commissionType?: string;
  commissionValue?: string | number | null;
}

export function InquiryCreateSidebar({
  isEdit,
  inquiryCode,
  customerName,
  selectedStyle,
  garmentLineCount,
  expectedQuantity,
  targetPrice,
  targetPriceCurrency,
  currency,
  exchangeRate,
  rateSource,
  shippingTerm,
  intermediaryLabel,
  commissionMode,
  commissionType,
  commissionValue,
}: InquiryCreateSidebarProps) {
  const targetPriceNumber = toSafeNumber(targetPrice);
  const exchangeRateNumber = toSafeNumber(exchangeRate);
  const commissionValueNumber = toSafeNumber(commissionValue);
  const styleImageUrl = useSecureImage(selectedStyle?.style_image_url);
  const hasStyleImage = Boolean(selectedStyle?.style_image_url);

  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:col-span-4 2xl:col-span-3 self-start">
      <section className="overflow-hidden rounded-2xl bg-surface-inverse text-text-inverse shadow-lg print-card">
        <div className="space-y-3 p-4">
          <h3 className="text-xl font-bold">Inquiry Snapshot</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-inverse/80">Customer</span>
              <span className="font-semibold text-right">{customerName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-inverse/80">Style</span>
              <span className="font-semibold text-right">
                {selectedStyle ? `${selectedStyle.style_code} - ${selectedStyle.name}` : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-inverse/80">Expected Qty</span>
              <span className="font-semibold">{expectedQuantity ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-inverse/80">Garment Lines</span>
              <span className="font-semibold">{garmentLineCount}</span>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-xs uppercase tracking-wide text-brand-primary">
              {isEdit && inquiryCode ? inquiryCode : "New Inquiry"}
            </div>
            <div className="mt-1 text-4xl font-extrabold">
              {formatMoney(targetPriceNumber)}{" "}
              <span className="text-base font-semibold">{targetPriceCurrency || "USD"}</span>
            </div>
          </div>
        </div>
        <div className="bg-brand-primary px-4 py-3 text-brand-primary-foreground">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider">
            <span>Doc Currency</span>
            <span className="text-sm font-bold">{currency || "USD"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider">Exchange Rate</span>
            <span className="text-lg font-bold">{exchangeRateNumber.toFixed(4)}</span>
          </div>
          {rateSource && (
            <div className="mt-1 text-xs">
              {rateSource === "live" ? "Live rate loaded." : "Fallback rate loaded."}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
        <h3 className="text-xl font-bold text-text-primary">Commercial Terms</h3>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Shipping Term</span>
            <span className="font-semibold text-text-primary text-right">{shippingTerm || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Customer Link</span>
            <span className="font-semibold text-text-primary text-right">{intermediaryLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Commission Mode</span>
            <span className="font-semibold text-text-primary text-right">{commissionMode || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Commission Type</span>
            <span className="font-semibold text-text-primary text-right">{commissionType || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">Commission Value</span>
            <span className="font-semibold text-text-primary text-right">
              {commissionValue ? `${commissionValueNumber.toFixed(2)}%` : "-"}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
        <h3 className="text-sm font-semibold text-text-primary">Style Preview</h3>
        {hasStyleImage ? (
          styleImageUrl ? (
            <img
              src={styleImageUrl}
              alt={selectedStyle?.name ?? "Style"}
              className="mt-2 h-36 w-full rounded border border-border object-cover"
            />
          ) : (
            <div
              className="mt-2 h-36 w-full rounded border border-border bg-surface-subtle animate-pulse"
              aria-hidden
            />
          )
        ) : (
          <p className="mt-2 text-xs text-text-muted">
            No style image selected yet. Uploading an image helps the team review inquiry details quickly.
          </p>
        )}
      </section>
    </aside>
  );
}
