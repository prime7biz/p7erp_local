import type {
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
  QuotationSizeRatioLine,
} from "@/api/client";

export function toSafeNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toFixedString(value: number, digits = 4): string {
  return value.toFixed(digits);
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

export function computeMaterialLineAmounts(
  row: Pick<QuotationMaterialLine, "consumption_per_dozen" | "unit_price">
): { amount_per_dozen: string; total_amount: string } {
  const amountPerDz = toSafeNumber(row.consumption_per_dozen) * toSafeNumber(row.unit_price);
  return {
    amount_per_dozen: toFixedString(amountPerDz),
    total_amount: toFixedString(amountPerDz),
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
