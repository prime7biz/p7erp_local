import type {
  QuotationDetailResponse,
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
} from "@/api/client";
import {
  fmt4,
  q4,
  safeComputeQuotation,
  type CmInput,
  type MaterialInput,
  type OtherCostInput,
  type QuotationInput,
  type QuotationResult,
  type SafeQuotationResult,
} from "./quotationCostingEngine";
import {
  isPersistableManufacturingRow,
  isPersistableMaterialRow,
  isPersistableOtherCostRow,
  lineFxToQuotation,
  toSafeNumber,
} from "./quotationNumeric";

/**
 * Glue between the quotation workspace rows (strings from the API) and the dozen-first engine.
 * Only rows that would be saved (see `isPersistable*`) take part, exactly like the server.
 */

function optNum(value: string | number | null | undefined): number | null {
  if (value == null || String(value).trim() === "") return null;
  return toSafeNumber(value);
}

export interface WorkspaceCostingState {
  quotation: Pick<
    QuotationDetailResponse,
    | "currency"
    | "projected_quantity"
    | "profit_percentage"
    | "margin_method"
    | "commission_mode"
    | "commission_type"
    | "commission_value"
  >;
  materials: QuotationMaterialLine[];
  manufacturing: QuotationManufacturingLine[];
  otherCosts: QuotationOtherCostLine[];
  /** Per-piece manual price typed by the user, or null for the calculated price. */
  manualPricePerPiece: number | null;
}

export function toEngineInput(state: WorkspaceCostingState): QuotationInput {
  const { quotation } = state;
  const qCur = quotation.currency ?? "USD";
  const materials: MaterialInput[] = state.materials.filter(isPersistableMaterialRow).map((m) => ({
    consumptionPerDozen: toSafeNumber(m.consumption_per_dozen),
    unitPrice: toSafeNumber(m.unit_price),
    wastagePct: optNum(m.wastage_pct),
    fx: lineFxToQuotation(m, qCur),
  }));
  const manufacturing: CmInput[] = state.manufacturing.filter(isPersistableManufacturingRow).map((m) => ({
    mode: m.cm_mode ?? null,
    fx: lineFxToQuotation(m, qCur),
    smv: optNum(m.smv),
    efficiencyPct: optNum(m.efficiency_pct),
    cpm: optNum(m.cpm),
    cpmBasis: m.cpm_basis ?? null,
    machinesRequired: Math.max(0, Math.trunc(Number(m.machines_required) || 0)),
    productionPerHour: optNum(m.production_per_hour),
    workingHoursPerDay: optNum(m.working_hours_per_day),
    costPerMachine: optNum(m.cost_per_machine),
    directCmBasis: m.direct_cm_basis ?? null,
    storedCostPerDozen: optNum(m.cost_per_dozen),
    storedCmPerPiece: optNum(m.cm_per_piece),
  }));
  const otherCosts: OtherCostInput[] = state.otherCosts.filter(isPersistableOtherCostRow).map((c) => ({
    costType: String(c.cost_type || "fixed").toLowerCase() === "percentage" ? "percentage" : "fixed",
    value: toSafeNumber(c.value),
    basedOn: c.based_on || "subtotal",
    costBasis: c.cost_basis ?? null,
    fx: lineFxToQuotation(c, qCur),
  }));
  return {
    materials,
    manufacturing,
    otherCosts,
    projectedQty: Math.max(0, Math.trunc(toSafeNumber(quotation.projected_quantity))),
    profitPct: toSafeNumber(quotation.profit_percentage),
    marginMethod: quotation.margin_method ?? "MARKUP_ON_COST",
    commission: {
      mode: quotation.commission_mode,
      type: quotation.commission_type,
      value: toSafeNumber(quotation.commission_value),
    },
    manualPricePerPiece: state.manualPricePerPiece,
  };
}

export function computeWorkspaceCosting(state: WorkspaceCostingState): SafeQuotationResult {
  return safeComputeQuotation(toEngineInput(state));
}

/** Result row k belongs to the k-th persistable row; this maps it back onto the full row list. */
export function persistableIndexes<T>(rows: T[], isPersistable: (row: T) => boolean): Array<number | null> {
  let k = 0;
  return rows.map((row) => (isPersistable(row) ? k++ : null));
}

/** True when every field in `patch` already has that value on `row` (so no state update is needed). */
function samePatch(row: object, patch: object): boolean {
  const current = row as Record<string, unknown>;
  return Object.entries(patch).every(([key, value]) => current[key] === value);
}

/** Fill calculated line amounts from the engine. Returns the same array when nothing changed. */
export function applyResultToMaterials(
  rows: QuotationMaterialLine[],
  result: QuotationResult,
  projectedQty: number,
): QuotationMaterialLine[] {
  const dozens = Math.max(0, projectedQty) / 12;
  const index = persistableIndexes(rows, isPersistableMaterialRow);
  let changed = false;
  const next = rows.map((row, i) => {
    const k = index[i];
    const res = k == null ? undefined : result.materials[k];
    const patch = res
      ? {
          amount_per_dozen: fmt4(res.amountPerDozen),
          total_amount: fmt4(res.amountPerDozen * dozens),
          base_amount: fmt4(res.nativePerDozen * dozens),
        }
      : { amount_per_dozen: "0.0000", total_amount: "0.0000", base_amount: "0.0000" };
    if (samePatch(row, patch)) return row;
    changed = true;
    return { ...row, ...patch };
  });
  return changed ? next : rows;
}

export function applyResultToManufacturing(
  rows: QuotationManufacturingLine[],
  result: QuotationResult,
  projectedQty: number,
): QuotationManufacturingLine[] {
  const qty = Math.max(0, projectedQty);
  const index = persistableIndexes(rows, isPersistableManufacturingRow);
  let changed = false;
  const next = rows.map((row, i) => {
    const k = index[i];
    const res = k == null ? undefined : result.manufacturing[k];
    if (!res) return row;
    const patch: Partial<QuotationManufacturingLine> = {
      total_order_cost: fmt4(res.cmPerPiece * qty),
      base_amount: fmt4(res.cmPerPiece * qty),
    };
    // A typed direct / old CM value is the input itself: never overwrite it with its own rounding.
    const typedPerDozen = row.cm_mode === "DIRECT" && (row.direct_cm_basis ?? "PER_DOZEN") === "PER_DOZEN";
    const typedPerPiece = row.cm_mode === "DIRECT" && row.direct_cm_basis === "PER_PIECE";
    if (row.cm_mode != null) {
      if (!typedPerDozen) patch.cost_per_dozen = fmt4(res.costPerDozen);
      if (!typedPerPiece) patch.cm_per_piece = fmt4(res.cmPerPiece);
    }
    if (res.productionPerDay != null) {
      patch.production_per_day = String(q4(res.productionPerDay));
      patch.total_line_cost = fmt4(res.dailyLineCost ?? 0);
    }
    const cmp: Record<string, unknown> = patch;
    const same = Object.keys(cmp).every((key) => (row as unknown as Record<string, unknown>)[key] === cmp[key]);
    if (same) return row;
    changed = true;
    return { ...row, ...patch };
  });
  return changed ? next : rows;
}

export function applyResultToOtherCosts(
  rows: QuotationOtherCostLine[],
  result: QuotationResult,
  projectedQty: number,
  quotationCurrency: string,
): QuotationOtherCostLine[] {
  const dozens = Math.max(0, projectedQty) / 12;
  const index = persistableIndexes(rows, isPersistableOtherCostRow);
  let changed = false;
  const next = rows.map((row, i) => {
    const k = index[i];
    const res = k == null ? undefined : result.otherCosts[k];
    if (!res) return row;
    const orderTotalInQuotationCcy = res.amountPerDozen * dozens;
    const isPct = String(row.cost_type || "fixed").toLowerCase() === "percentage";
    const fx = lineFxToQuotation(row, quotationCurrency) || 1;
    const amount = isPct ? orderTotalInQuotationCcy : orderTotalInQuotationCcy / fx;
    const patch = { calculated_amount: fmt4(amount), total_amount: fmt4(amount) };
    if (samePatch(row, patch)) return row;
    changed = true;
    return { ...row, ...patch };
  });
  return changed ? next : rows;
}

/** Header numbers the workspace shows live (the server writes the same ones on save). */
export function headerPatchFromResult(
  result: QuotationResult,
  projectedQty: number,
): Partial<QuotationDetailResponse> {
  const qty = Math.max(0, projectedQty);
  const dozens = qty / 12;
  const orderTotal = fmt4(q4(result.pricePerPiece) * qty);
  return {
    material_cost_per_dozen: fmt4(result.materialPerDozen),
    manufacturing_cost_per_dozen: fmt4(result.manufacturingPerDozen),
    other_cost_per_dozen: fmt4(result.otherPerDozen),
    total_cost_per_dozen: fmt4(result.totalCostPerDozen),
    quoted_price_per_dozen: fmt4(result.pricePerDozen),
    quoted_price_per_piece: fmt4(result.pricePerPiece),
    material_cost: fmt4(result.materialPerDozen * dozens),
    manufacturing_cost: fmt4(result.manufacturingPerDozen * dozens),
    other_cost: fmt4(result.otherPerDozen * dozens),
    total_cost: fmt4(result.totalCostPerDozen * dozens),
    cost_per_piece: fmt4(result.costPerPiece),
    quoted_price: orderTotal,
    total_amount: orderTotal,
  };
}

/** Order totals (quotation currency) the legacy sidebar cards and footers use. */
export function orderTotalsFromResult(result: QuotationResult, projectedQty: number) {
  const dozens = Math.max(0, projectedQty) / 12;
  const matTotal = result.materialPerDozen * dozens;
  const mfgTotal = result.manufacturingPerDozen * dozens;
  const otherTotal = result.otherPerDozen * dozens;
  return { matTotal, mfgTotal, otherTotal, total: matTotal + mfgTotal + otherTotal };
}
