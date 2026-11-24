import type { CostingItemResponse, ItemUnitResponse, QuotationMaterialLine, QuotationSizeRatioLine } from "@/api/client";
import type { WiringBomLine } from "@/api/quotationWiring.types";
import { computeMaterialLineAmounts, sizeQuantityFromRatio, toSafeNumber } from "./quotationNumeric";

/** Costing lines are locked once the quotation is approved / sent / converted (or replaced by a newer version). */
export function isQuotationCostingLocked(status: string | null | undefined, superseded: boolean): boolean {
  return superseded || ["APPROVED", "SENT", "CONVERTED"].includes((status ?? "").toUpperCase());
}

/**
 * Turn Style BOM lines into DRAFT material rows (nothing is saved here; the user confirms with Save).
 * - Consumption per dozen = BOM consumption per piece x 12. Wastage % is NOT applied (the user decides).
 * - Items already on the quotation are skipped. Unit price starts at 0.
 */
export function bomLinesToMaterialRows(args: {
  lines: WiringBomLine[];
  existing: QuotationMaterialLine[];
  items: CostingItemResponse[];
  units: ItemUnitResponse[];
  projectedQuantity: number;
  quotationCurrency: string;
}): { rows: QuotationMaterialLine[]; skipped: number } {
  const { lines, existing, items, units, projectedQuantity, quotationCurrency } = args;
  const haveItem = new Set(existing.map((m) => m.item_id).filter((v): v is number => v != null));
  const rows: QuotationMaterialLine[] = [];
  let skipped = 0;
  for (const ln of lines) {
    if (ln.item_id != null && haveItem.has(ln.item_id)) {
      skipped += 1;
      continue;
    }
    if (ln.item_id != null) haveItem.add(ln.item_id);
    const item = ln.item_id != null ? items.find((i) => i.id === ln.item_id) : undefined;
    const unitRow = item ? units.find((u) => u.id === item.unit_id) : undefined;
    const perPiece = toSafeNumber(ln.base_consumption);
    const base: QuotationMaterialLine = {
      serial_no: existing.length + rows.length + 1,
      category_id: item?.category_id ?? null,
      item_id: item ? item.id : null,
      description: ln.description || item?.name || ln.item_code || null,
      unit: unitRow?.name ?? unitRow?.unit_code ?? item?.unit_name ?? item?.unit_code ?? ln.uom ?? "",
      consumption_per_dozen: (perPiece * 12).toFixed(4),
      unit_price: "0",
      amount_per_dozen: "0",
      total_amount: "0",
      currency: quotationCurrency,
      exchange_rate: "1",
      base_amount: "0",
      local_amount: "0",
    };
    rows.push({ ...base, ...computeMaterialLineAmounts(base, projectedQuantity, quotationCurrency) });
  }
  return { rows, skipped };
}

/** Equal split of 100% over the scale's sizes; the last size takes the rounding remainder so the total is exactly 100. */
export function sizesToRatioRows(sizes: string[], projectedQuantity: number): QuotationSizeRatioLine[] {
  const clean = sizes.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  const each = Math.floor((100 / clean.length) * 100) / 100;
  let used = 0;
  return clean.map((size, i) => {
    const last = i === clean.length - 1;
    const pct = last ? Math.round((100 - used) * 100) / 100 : each;
    used += pct;
    const ratio = pct.toFixed(2);
    return {
      serial_no: i + 1,
      size,
      ratio_percentage: ratio,
      fabric_factor: "1.0",
      quantity: sizeQuantityFromRatio(projectedQuantity, ratio),
    };
  });
}

/** Re-number copied lines and drop their ids so they are saved as NEW lines on this quotation. */
export function copyLines<T extends { id?: number | null; serial_no: number }>(rows: T[]): T[] {
  return rows.map((r, i) => ({ ...r, id: null, serial_no: i + 1 }));
}

/** Compact price-hint text, or null when the hint must not be shown. */
export function comparableHintText(
  hint: { comparable: boolean; uom: string | null; last_po: { unit_price: string | null; currency: string | null; po_code: string | null } | null } | undefined,
  rowCurrency: string | null | undefined,
): string | null {
  if (!hint || !hint.comparable || !hint.last_po || !hint.last_po.unit_price) return null;
  if ((hint.last_po.currency ?? "").toUpperCase() !== (rowCurrency ?? "").toUpperCase()) return null;
  const per = hint.uom ? `/${hint.uom}` : "";
  return `Last PO ${hint.last_po.unit_price} ${hint.last_po.currency}${per}${hint.last_po.po_code ? ` (${hint.last_po.po_code})` : ""}`;
}
