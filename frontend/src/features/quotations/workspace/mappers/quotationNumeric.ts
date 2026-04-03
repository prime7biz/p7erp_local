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

/** Multiplier from line currency amount → quotation currency (1 when same currency). */
export function lineFxToQuotation(
  row: { currency?: string | null; exchange_rate?: string | null },
  quotationCurrency: string,
): number {
  const q = (quotationCurrency || "USD").trim().toUpperCase();
  const l = (row.currency || q).trim().toUpperCase();
  if (l === q) return 1;
  return Math.max(0, toSafeNumber(row.exchange_rate) || 1);
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function resolveOtherCostAmount(row: QuotationOtherCostLine): number {
  return toSafeNumber(row.calculated_amount) || toSafeNumber(row.total_amount);
}

/** Recalculate derived amounts for one other-cost row (fabric+CM subtotal for % rows). */
export function applyOtherCostCalculation(
  row: QuotationOtherCostLine,
  matMfgSubtotal: number
): QuotationOtherCostLine {
  const base = Math.max(0, matMfgSubtotal);
  if (row.cost_type === "fixed") {
    const v = toSafeNumber(row.value);
    const s = v.toFixed(2);
    return { ...row, calculated_amount: s, total_amount: s };
  }
  const pct = toSafeNumber(row.value);
  const amt = (base * pct) / 100;
  const s = amt.toFixed(2);
  return { ...row, calculated_amount: s, total_amount: s, percentage: String(pct) };
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
