import { useState } from "react";
import { api, type LiveRatesResponse, type QuotationDetailResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import {
  CostingCalcError,
  marginForTarget,
  type MarginMethod,
  type QuotationResult,
  type SafeQuotationResult,
} from "../mappers/quotationCostingEngine";
import { formatMoney, toSafeNumber } from "../mappers/quotationNumeric";
import { targetInQuotationCurrency } from "../mappers/targetMatch";

interface FobStudioCardProps {
  quotation: QuotationDetailResponse;
  /** Live dozen-first engine result (null while the quotation is not dozen-first). */
  costing: SafeQuotationResult | null;
  isEditing: boolean;
  useManualPrice: boolean;
  setUseManualPrice: (next: boolean) => void;
  manualPricePerPiece: string;
  setManualPricePerPiece: (next: string) => void;
  updateHeader: (patch: Partial<QuotationDetailResponse>) => void;
}

const METHOD_LABEL: Record<MarginMethod, string> = {
  MARKUP_ON_COST: "Markup on cost",
  MARGIN_ON_FOB: "Margin on FOB price",
};

type Preview = {
  marginPct: number;
  profitPerDozen: number;
  isLoss: boolean;
  targetPerPiece: number;
  rate: number;
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-secondary">{label}</span>
      <span className={strong ? "font-bold text-text-primary" : "font-semibold text-text-primary"}>{value}</span>
    </div>
  );
}

/**
 * Right-hand "FOB Studio" for dozen-first quotations: costs per dozen, the price per piece and
 * the buyer-target helper. Numbers are a live preview; the server recalculates when you save.
 */
export function FobStudioCard({
  quotation,
  costing,
  isEditing,
  useManualPrice,
  setUseManualPrice,
  manualPricePerPiece,
  setManualPricePerPiece,
  updateHeader,
}: FobStudioCardProps) {
  const cur = quotation.currency ?? "USD";
  const method: MarginMethod = quotation.margin_method ?? "MARKUP_ON_COST";
  const qty = Math.max(0, Math.trunc(toSafeNumber(quotation.projected_quantity)));
  const result: QuotationResult | null = costing && costing.ok ? costing.result : null;

  const [rates, setRates] = useState<LiveRatesResponse | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [matchError, setMatchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmLoss, setConfirmLoss] = useState(false);

  const targetCur = (quotation.target_price_currency ?? cur).toUpperCase();
  const hasTarget = toSafeNumber(quotation.target_price) > 0;
  const converted = targetInQuotationCurrency({
    targetPrice: quotation.target_price,
    targetCurrency: targetCur,
    quotationCurrency: cur,
    rates,
  });
  const gap = result && converted.ok ? result.pricePerPiece - converted.perPiece : null;

  const runPreview = async () => {
    if (!result) return;
    setMatchError("");
    setPreview(null);
    setConfirmLoss(false);
    setBusy(true);
    try {
      let liveRates = rates;
      if (targetCur !== cur.toUpperCase()) {
        liveRates = await api.getLiveRates(cur.toUpperCase());
        setRates(liveRates);
      }
      const target = targetInQuotationCurrency({
        targetPrice: quotation.target_price,
        targetCurrency: targetCur,
        quotationCurrency: cur,
        rates: liveRates,
      });
      if (!target.ok) {
        setMatchError(target.reason);
        return;
      }
      const match = marginForTarget({
        targetPerPiece: target.perPiece,
        costPerDozen: result.totalCostPerDozen,
        marginMethod: method,
        commission: {
          mode: quotation.commission_mode,
          type: quotation.commission_type,
          value: toSafeNumber(quotation.commission_value),
        },
        projectedQty: qty,
      });
      setPreview({ ...match, targetPerPiece: target.perPiece, rate: target.rate });
    } catch (err) {
      if (err instanceof CostingCalcError) setMatchError(err.message);
      else {
        logApiError("FobStudioCard.matchTarget", err);
        setMatchError("Could not load the exchange rate. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    if (preview.isLoss && !confirmLoss) return;
    updateHeader({ profit_percentage: preview.marginPct.toFixed(4) });
    setUseManualPrice(false);
    setManualPricePerPiece("");
    setPreview(null);
    setConfirmLoss(false);
  };

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card" aria-label="FOB studio">
      <h3 className="text-xl font-bold text-text-primary">FOB Studio</h3>
      <p className="mt-0.5 text-xs text-text-muted">
        Cost per dozen (12 pcs). The buyer price is quoted per piece.
      </p>

      {costing && !costing.ok ? (
        <div role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-xs text-status-danger-foreground">
          {costing.message}
        </div>
      ) : null}

      <div className="mt-3 space-y-1.5 text-sm">
        <Row label="Materials / dozen" value={`${formatMoney(result?.materialPerDozen ?? 0)} ${cur}`} />
        <Row label="CM / dozen" value={`${formatMoney(result?.manufacturingPerDozen ?? 0)} ${cur}`} />
        <Row label="Other costs / dozen" value={`${formatMoney(result?.otherPerDozen ?? 0)} ${cur}`} />
        <div className="border-t border-border-subtle pt-1.5">
          <Row label="Total cost / dozen" value={`${formatMoney(result?.totalCostPerDozen ?? 0)} ${cur}`} strong />
          <Row label="Cost / piece" value={`${(result?.costPerPiece ?? 0).toFixed(4)} ${cur}`} />
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-border-subtle pt-3 text-sm">
        {isEditing ? (
          <>
            <div>
              <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="fob-margin-method">
                Margin method
              </label>
              <select
                id="fob-margin-method"
                value={method}
                onChange={(e) => updateHeader({ margin_method: e.target.value as MarginMethod })}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              >
                {(Object.keys(METHOD_LABEL) as MarginMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {method === "MARKUP_ON_COST"
                  ? "Price = cost + margin % of cost."
                  : "Price = cost ÷ (1 − margin %): the margin is a share of the price the buyer sees."}
              </p>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-text-muted" htmlFor="fob-margin-pct">
                {method === "MARKUP_ON_COST" ? "Markup on cost (%)" : "Margin on price (%)"}
              </label>
              <input
                id="fob-margin-pct"
                type="number"
                step="any"
                value={quotation.profit_percentage ?? ""}
                onChange={(e) => updateHeader({ profit_percentage: e.target.value })}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              />
            </div>
          </>
        ) : (
          <>
            <Row label="Margin method" value={METHOD_LABEL[method]} />
            <Row label={method === "MARKUP_ON_COST" ? "Markup on cost" : "Margin on price"} value={`${toSafeNumber(quotation.profit_percentage).toFixed(2)}%`} />
          </>
        )}

        {result && result.commissionMemoPerDozen > 0 ? (
          <Row
            label={`Commission / dozen (${result.commissionPerDozen > 0 ? "in price" : "not in price"})`}
            value={`${formatMoney(result.commissionMemoPerDozen)} ${cur}`}
          />
        ) : null}
      </div>

      <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
        <div>
          <div className="text-sm font-semibold text-text-secondary">Price / dozen</div>
          <div className="mt-0.5 text-xl font-bold text-text-primary">
            {formatMoney(result?.pricePerDozen ?? 0)} <span className="text-sm font-normal text-text-secondary">{cur}</span>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-text-secondary">
            Quoted price / piece {result?.priceIsManual ? <span className="text-xs font-normal text-status-warning-foreground">(manual)</span> : null}
          </div>
          <div className="mt-0.5 text-3xl font-bold text-brand-primary">
            {(result?.pricePerPiece ?? 0).toFixed(4)} <span className="text-base font-normal text-text-secondary">{cur}</span>
          </div>
        </div>
        {result && result.marginPctEffective != null ? (
          <Row label="Margin on price (effective)" value={`${result.marginPctEffective.toFixed(2)}%`} />
        ) : null}
        <div>
          <div className="text-sm font-semibold text-text-secondary">Order value</div>
          {qty > 0 ? (
            <div className="mt-0.5 text-lg font-bold text-text-primary">
              {formatMoney((result?.pricePerPiece ?? 0) * qty)} <span className="text-sm font-normal text-text-secondary">{cur}</span>
              <span className="ml-2 text-xs font-normal text-text-muted">for {qty.toLocaleString()} pcs</span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-text-muted">Expected quantity is not set. Costing and the per-piece price still work.</div>
          )}
        </div>

        {isEditing ? (
          <div className="rounded-lg border border-border bg-surface-subtle p-2.5">
            <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={useManualPrice} onChange={(e) => setUseManualPrice(e.target.checked)} />
              Type my own price per piece
            </label>
            <input
              type="number"
              step="0.0001"
              min={0}
              disabled={!useManualPrice}
              value={manualPricePerPiece}
              onChange={(e) => setManualPricePerPiece(e.target.value)}
              placeholder="Calculated"
              aria-label="Manual quoted price per piece"
              className="mt-1.5 w-full rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 border-t border-border-subtle pt-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Buyer target</div>
        {hasTarget ? (
          <>
            <Row label="Target / piece" value={`${formatMoney(toSafeNumber(quotation.target_price))} ${targetCur}`} />
            {converted.ok && gap != null ? (
              <Row
                label={gap > 0 ? "Above target by" : "Below target by"}
                value={`${Math.abs(gap).toFixed(4)} ${cur}`}
              />
            ) : null}
            {isEditing ? (
              <button
                type="button"
                onClick={runPreview}
                disabled={busy || !result}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
              >
                {busy ? "Checking rate…" : "Preview: match buyer target"}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-text-muted">Add a buyer target in the basics to compare your price with it.</p>
        )}
        {matchError ? (
          <p role="alert" className="text-xs text-status-danger-foreground">
            {matchError}
          </p>
        ) : null}
        {preview ? (
          <div className="space-y-2 rounded-lg border border-status-info/30 bg-status-info-subtle p-2.5 text-xs text-text-secondary">
            <div>
              To quote <span className="font-semibold">{preview.targetPerPiece.toFixed(4)} {cur}</span> per piece you need a{" "}
              {method === "MARKUP_ON_COST" ? "markup" : "margin"} of{" "}
              <span className="font-semibold">{preview.marginPct.toFixed(2)}%</span>
              {preview.rate !== 1 ? ` (rate ${preview.rate.toFixed(6)})` : ""}.
            </div>
            {preview.isLoss ? (
              <div className="rounded border border-status-danger/30 bg-status-danger-subtle p-2 text-status-danger-foreground">
                This target is below your cost: you would lose {formatMoney(Math.abs(preview.profitPerDozen))} {cur} per dozen
                {result && result.totalCostPerDozen > 0
                  ? ` (${((Math.abs(preview.profitPerDozen) / result.totalCostPerDozen) * 100).toFixed(1)}% of cost)`
                  : ""}
                .
                <label className="mt-1.5 flex items-start gap-2">
                  <input type="checkbox" checked={confirmLoss} onChange={(e) => setConfirmLoss(e.target.checked)} />
                  <span>I understand and want to apply a negative margin.</span>
                </label>
              </div>
            ) : (
              <div>Expected profit: {formatMoney(preview.profitPerDozen)} {cur} per dozen.</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyPreview}
                disabled={preview.isLoss && !confirmLoss}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                Apply to draft
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setConfirmLoss(false);
                }}
                className="rounded-lg border border-border px-3 py-1 text-xs text-text-secondary"
              >
                Dismiss
              </button>
            </div>
            <p className="text-[11px] text-text-muted">Applying only changes this draft. Save to keep it.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
