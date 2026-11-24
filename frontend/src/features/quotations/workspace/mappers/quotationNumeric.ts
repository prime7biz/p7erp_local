import type {
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
  QuotationSizeRatioLine,
} from "@/api/client";

/** Matches PrimeX `quotation-form.tsx` manufacturing recalc (8h day). */
export const QUOTATION_MANUFACTURING_HOURS_PER_DAY = 8;

export function toSafeNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toFixedString(value: number, digits = 4): string {
  return value.toFixed(digits);
}

/** Local calendar date as YYYY-MM-DD (never UTC ISO with time). */
export function localDateYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Multiplier from line currency amount → quotation currency (1 when same currency). */
export function lineFxToQuotation(
  row: { currency?: string | null; exchange_rate?: string | null },
  quotationCurrency: string,
): number {
  const q = (quotationCurrency || "USD").trim().toUpperCase();
  const l = (row.currency || q).trim().toUpperCase();
  if (l === q) return 1;
  const rate = toSafeNumber(row.exchange_rate);
  if (rate <= 0) return 1;
  return rate;
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Prefer calculated_amount when set (including "0" / "0.00"); match backend other_cost_rollup_amount_string. */
export function resolveOtherCostAmount(row: QuotationOtherCostLine): number {
  const calc = row.calculated_amount;
  if (calc != null && String(calc).trim() !== "") {
    return toSafeNumber(calc);
  }
  return toSafeNumber(row.total_amount);
}

/**
 * Recalculate derived amounts for one other-cost row.
 * `based_on`: subtotal (mat+mfg), materials, or manufacturing.
 */
export function applyOtherCostCalculation(
  row: QuotationOtherCostLine,
  matTotal: number,
  mfgTotal: number = 0,
): QuotationOtherCostLine {
  const based = String(row.based_on || "subtotal").trim().toLowerCase();
  let base = Math.max(0, matTotal + mfgTotal);
  if (based === "materials" || based === "material") {
    base = Math.max(0, matTotal);
  } else if (based === "manufacturing" || based === "cm" || based === "labor") {
    base = Math.max(0, mfgTotal);
  }
  const baseStr = base.toFixed(2);
  if (row.cost_type === "fixed") {
    const v = toSafeNumber(row.value);
    const s = v.toFixed(2);
    return {
      ...row,
      calculated_amount: s,
      total_amount: s,
      percentage: "0",
      base_amount: baseStr,
    };
  }
  const pct = toSafeNumber(row.value);
  const amt = (base * pct) / 100;
  const s = amt.toFixed(2);
  return {
    ...row,
    calculated_amount: s,
    total_amount: s,
    percentage: String(pct),
    base_amount: baseStr,
  };
}

/**
 * Commission amount in quotation currency.
 * INCLUDE: added into auto-derived quoted price.
 * EXCLUDE: memo only (returned for display, caller decides whether to add).
 */
export function computeCommissionAmount(opts: {
  mode: string | null | undefined;
  type: string | null | undefined;
  value: string | number | null | undefined;
  /** Cost + factory margin (before commission). */
  baseForPercent: number;
}): { amount: number; includedInQuoted: boolean } {
  const mode = String(opts.mode || "EXCLUDE").trim().toUpperCase();
  const type = String(opts.type || "").trim().toUpperCase();
  const raw = toSafeNumber(opts.value);
  let amount = 0;
  if (type === "FIXED") {
    amount = Math.max(0, raw);
  } else if (type === "PERCENTAGE") {
    amount = Math.max(0, (opts.baseForPercent * raw) / 100);
  }
  return {
    amount,
    includedInQuoted: mode === "INCLUDE" && amount > 0,
  };
}

/** Factory cost ÷ projected qty (ex-profit). Zero when qty ≤ 0. */
export function computeCostPerPiece(totalCost: number, projectedQuantity: number): number {
  const qty = toSafeNumber(projectedQuantity);
  return qty > 0 ? toSafeNumber(totalCost) / qty : 0;
}

/**
 * Auto-derived order-total quoted price: cost + factory margin (+ INCLUDE commission).
 * Shared by live edit rollup and cancelEdit manual-vs-auto detection.
 */
export function computeAutoQuotedPrice(opts: {
  totalCost: number;
  profitPercentage: number;
  commissionMode: string | null | undefined;
  commissionType: string | null | undefined;
  commissionValue: string | number | null | undefined;
}): number {
  const totalCost = toSafeNumber(opts.totalCost);
  const marginAmount = (totalCost * toSafeNumber(opts.profitPercentage)) / 100;
  const beforeCommission = totalCost + marginAmount;
  const commission = computeCommissionAmount({
    mode: opts.commissionMode,
    type: opts.commissionType,
    value: opts.commissionValue,
    baseForPercent: beforeCommission,
  });
  return beforeCommission + (commission.includedInQuoted ? commission.amount : 0);
}

/**
 * PrimeX parity: total_line_cost = machines × cost_per_machine;
 * cost_per_dozen = total_line_cost / (production_per_day / 12);
 * cm_per_piece = cost_per_dozen / 12; total_order_cost = cm_per_piece × projected_qty.
 * Uses row.production_per_day when positive; otherwise falls back to pph × machines × hours/day.
 */
export function computeManufacturingLineAmounts(
  row: Pick<
    QuotationManufacturingLine,
    "machines_required" | "production_per_hour" | "production_per_day" | "cost_per_machine"
  >,
  projectedQuantity: number,
): Pick<
  QuotationManufacturingLine,
  "total_line_cost" | "cost_per_dozen" | "cm_per_piece" | "total_order_cost" | "base_amount"
> {
  const machines = Math.max(0, Number(row.machines_required) || 0);
  const pph = toSafeNumber(row.production_per_hour);
  const costMach = toSafeNumber(row.cost_per_machine);
  let prodDay = toSafeNumber(row.production_per_day);
  if (prodDay <= 0) {
    prodDay = Math.round(pph * machines * QUOTATION_MANUFACTURING_HOURS_PER_DAY);
  }
  const totalLineCost = machines * costMach;
  const costPerDozen = prodDay > 0 ? totalLineCost / (prodDay / 12) : 0;
  const cmPerPiece = costPerDozen / 12;
  const qty = Math.max(0, projectedQuantity);
  const totalOrderCost = cmPerPiece * qty;
  return {
    total_line_cost: totalLineCost.toFixed(2),
    cost_per_dozen: costPerDozen.toFixed(4),
    cm_per_piece: cmPerPiece.toFixed(4),
    total_order_cost: totalOrderCost.toFixed(2),
    base_amount: totalOrderCost.toFixed(2),
  };
}

export function computeMaterialLineAmounts(
  row: Pick<QuotationMaterialLine, "consumption_per_dozen" | "unit_price" | "exchange_rate" | "currency">,
  projectedQuantity: number,
  quotationCurrency: string,
): { amount_per_dozen: string; total_amount: string; base_amount: string } {
  const qty = Math.max(0, projectedQuantity);
  const dozens = qty / 12;
  const quotCur = (quotationCurrency || "USD").trim().toUpperCase();
  const lineCur = (row.currency || quotCur).trim().toUpperCase();
  const nativePerDz = toSafeNumber(row.consumption_per_dozen) * toSafeNumber(row.unit_price);
  const exchangeRate =
    lineCur === quotCur ? 1 : Math.max(0, toSafeNumber(row.exchange_rate) || 1);
  const amountPerDz = nativePerDz * exchangeRate;
  const baseTotal = nativePerDz * dozens;
  const convTotal = amountPerDz * dozens;
  return {
    amount_per_dozen: toFixedString(amountPerDz),
    total_amount: toFixedString(convTotal),
    base_amount: toFixedString(baseTotal),
  };
}

export function isPersistableMaterialRow(row: QuotationMaterialLine): boolean {
  return Boolean(row.category_id || row.item_id || (row.description ?? "").trim());
}

export function isPersistableManufacturingRow(row: QuotationManufacturingLine): boolean {
  return Boolean((row.style_part ?? "").trim());
}

export function isPersistableOtherCostRow(row: QuotationOtherCostLine): boolean {
  return Boolean((row.cost_head ?? "").trim());
}

export function isPersistableSizeRatioRow(row: QuotationSizeRatioLine): boolean {
  return Boolean((row.size ?? "").trim());
}

/** Size quantity from projected order qty and ratio %. */
export function sizeQuantityFromRatio(projectedQuantity: number, ratioPercentage: string | number): number {
  const pq = Math.max(0, projectedQuantity);
  const pct = toSafeNumber(ratioPercentage);
  return Math.round((pq * pct) / 100);
}
