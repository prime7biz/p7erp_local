import type {
  QuotationDetailResponse,
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
  QuotationSizeRatioLine,
} from "@/api/client";

/**
 * Not user changes: totals the workspace recalculates on its own after every load, and the workflow
 * status that Submit / Approve change on the server.
 */
const HEADER_SKIPPED = [
  "status",
  "material_cost",
  "manufacturing_cost",
  "other_cost",
  "total_cost",
  "total_amount",
  "quoted_price",
  "cost_per_piece",
  // Dozen-first numbers the workspace and the server calculate.
  "material_cost_per_dozen",
  "manufacturing_cost_per_dozen",
  "other_cost_per_dozen",
  "total_cost_per_dozen",
  "quoted_price_per_dozen",
  "quoted_price_per_piece",
] as const;
/** Browser-only row key (never a user change). */
const ROW_KEY = ["_rowKey"] as const;
const MATERIAL_CALCULATED = ["amount_per_dozen", "total_amount", "base_amount"] as const;
const MANUFACTURING_CALCULATED = [
  "total_line_cost",
  "cost_per_dozen",
  "cm_per_piece",
  "total_order_cost",
  "base_amount",
] as const;
const OTHER_COST_CALCULATED = ["calculated_amount", "total_amount", "percentage"] as const;

function withoutKeys(row: object, keys: readonly string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of keys) delete copy[key];
  return copy;
}

export interface QuotationDirtyInput {
  quotation: QuotationDetailResponse | null;
  materials: QuotationMaterialLine[];
  manufacturing: QuotationManufacturingLine[];
  otherCosts: QuotationOtherCostLine[];
  sizeRatios: QuotationSizeRatioLine[];
  useManualQuotedPrice: boolean;
  manualQuotedPrice: string;
}

/** The quotation values a user can type or pick, used to detect unsaved changes. */
export function quotationDirtyValues(input: QuotationDirtyInput) {
  return {
    header: input.quotation ? withoutKeys(input.quotation, HEADER_SKIPPED) : null,
    materials: input.materials.map((row) => withoutKeys(row, [...MATERIAL_CALCULATED, ...ROW_KEY])),
    manufacturing: input.manufacturing.map((row) =>
      // With a dozen-first method the line output per day is calculated, not typed.
      withoutKeys(row, [
        ...MANUFACTURING_CALCULATED,
        ...ROW_KEY,
        ...(row.cm_mode ? (["production_per_day"] as const) : []),
      ]),
    ),
    otherCosts: input.otherCosts.map((row) => withoutKeys(row, [...OTHER_COST_CALCULATED, ...ROW_KEY])),
    sizeRatios: input.sizeRatios,
    useManualQuotedPrice: input.useManualQuotedPrice,
    manualQuotedPrice: input.manualQuotedPrice,
  };
}
