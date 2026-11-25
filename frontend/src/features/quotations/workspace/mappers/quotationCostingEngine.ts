/**
 * Dozen-first quotation costing: LIVE PREVIEW mirror of the server engine
 * (`backend/app/modules/quotations/quotation_costing_calculator.py`).
 *
 * - The server is the authority. It recalculates on every save, and the saved numbers win.
 * - Everything is costed PER DOZEN (12 pcs). The buyer price is quoted PER PIECE = per dozen / 12.
 * - Same formulas and the same error codes as the server.
 * - Browser numbers are floats; `q4` removes float noise and rounds half-up to 4 decimals.
 * - Shared test cases: `backend/tests/fixtures/quotation_costing_parity.json`
 *   (checked by `quotationCostingEngine.test.ts`).
 */

export const TWELVE = 12;
export const MIN_FOB_DENOMINATOR = 0.01;
export const DEFAULT_WORKING_HOURS = 8;

export type CmMode = "SMV_CPM" | "LINE_OUTPUT" | "DIRECT";
export type CpmBasis = "EARNED_MIN" | "AVAILABLE_MIN";
export type DirectCmBasis = "PER_DOZEN" | "PER_PIECE";
export type CostBasis = "PER_DOZEN" | "PER_PIECE" | "PER_ORDER";
export type MarginMethod = "MARKUP_ON_COST" | "MARGIN_ON_FOB";

export class CostingCalcError extends Error {
  readonly code: string;
  readonly field: string | null;
  constructor(code: string, message: string, field: string | null = null) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

/** Round half-up (away from zero) to 4 decimals, ignoring binary float noise. */
export function q4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const cleaned = Number(Math.abs(value).toPrecision(14));
  const rounded = Math.floor(cleaned * 10000 + 0.5) / 10000;
  return rounded === 0 ? 0 : sign * rounded;
}

/** Text like "12.3400" with 4 decimals. */
export function fmt4(value: number): string {
  return q4(value).toFixed(4);
}

function num(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const s = String(value).trim().replace(/,/g, "");
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------- inputs
export interface MaterialInput {
  consumptionPerDozen: number;
  unitPrice: number;
  wastagePct?: number | null;
  /** line currency -> quotation currency */
  fx?: number;
}

export interface CmInput {
  /** null = old line inside a new-basis quotation; keeps its stored per-piece value */
  mode: CmMode | null;
  fx?: number;
  smv?: number | null;
  efficiencyPct?: number | null;
  cpm?: number | null;
  cpmBasis?: CpmBasis | null;
  machinesRequired?: number;
  productionPerHour?: number | null;
  workingHoursPerDay?: number | null;
  costPerMachine?: number | null;
  directCmBasis?: DirectCmBasis | null;
  storedCostPerDozen?: number | null;
  storedCmPerPiece?: number | null;
}

export interface OtherCostInput {
  costType: "fixed" | "percentage";
  value: number;
  basedOn?: string;
  costBasis?: CostBasis | null;
  fx?: number;
}

export interface CommissionInput {
  mode?: string | null; // INCLUDE | EXCLUDE
  type?: string | null; // PERCENTAGE | FIXED
  value?: number;
}

export interface QuotationInput {
  materials: MaterialInput[];
  manufacturing: CmInput[];
  otherCosts: OtherCostInput[];
  projectedQty: number;
  profitPct: number;
  marginMethod?: MarginMethod;
  commission?: CommissionInput;
  manualPricePerPiece?: number | null;
}

// ---------------------------------------------------------------- results
export interface MaterialResult {
  effectiveConsumption: number;
  nativePerDozen: number;
  amountPerDozen: number;
}
export interface CmResult {
  cmPerPiece: number;
  costPerDozen: number;
  productionPerDay: number | null;
  dailyLineCost: number | null;
  amountPerDozen: number;
}
export interface OtherCostResult {
  amountPerDozen: number;
}
export interface QuotationResult {
  materials: MaterialResult[];
  manufacturing: CmResult[];
  otherCosts: OtherCostResult[];
  materialPerDozen: number;
  manufacturingPerDozen: number;
  otherPerDozen: number;
  totalCostPerDozen: number;
  costPerPiece: number;
  commissionPerDozen: number;
  commissionMemoPerDozen: number;
  pricePerDozen: number;
  pricePerPiece: number;
  priceIsManual: boolean;
  /** Margin implied by the final price, as % of the price (FOB view). */
  marginPctEffective: number | null;
}

// ---------------------------------------------------------------- lines
export function computeMaterial(line: MaterialInput): MaterialResult {
  if (line.consumptionPerDozen < 0 || line.unitPrice < 0) {
    throw new CostingCalcError("COSTING_NEGATIVE_INPUT", "Consumption and unit price cannot be negative.");
  }
  const wastage = line.wastagePct ?? 0;
  if (wastage < 0 || wastage > 1000) {
    throw new CostingCalcError("COSTING_BAD_WASTAGE", "Wastage % must be between 0 and 1000.", "wastage_pct");
  }
  const effective = line.consumptionPerDozen * (1 + wastage / 100);
  const native = effective * line.unitPrice;
  return {
    effectiveConsumption: effective,
    nativePerDozen: native,
    amountPerDozen: native * (line.fx ?? 1),
  };
}

export function computeCm(line: CmInput): CmResult {
  const mode = line.mode;
  let cmPc: number;
  let dailyCost: number | null = null;
  let prodDay: number | null = null;

  if (mode == null) {
    cmPc = num(line.storedCmPerPiece);
    if (cmPc === 0 && line.storedCostPerDozen) cmPc = num(line.storedCostPerDozen) / TWELVE;
  } else if (mode === "SMV_CPM") {
    const smv = num(line.smv);
    const cpm = num(line.cpm);
    if (smv < 0 || cpm < 0) {
      throw new CostingCalcError("COSTING_NEGATIVE_INPUT", "SMV and CPM cannot be negative.");
    }
    const basis = line.cpmBasis;
    if (basis !== "EARNED_MIN" && basis !== "AVAILABLE_MIN") {
      throw new CostingCalcError(
        "CM_CPM_BASIS_REQUIRED",
        "Choose how the CPM was measured (earned minute or available minute).",
        "cpm_basis",
      );
    }
    if (basis === "EARNED_MIN") {
      cmPc = smv * cpm;
    } else {
      const eff = num(line.efficiencyPct);
      if (eff <= 0 || eff > 150) {
        throw new CostingCalcError(
          "CM_EFFICIENCY_INVALID",
          "Efficiency % must be above 0 and at most 150 when CPM is per available minute.",
          "efficiency_pct",
        );
      }
      cmPc = (smv / (eff / 100)) * cpm;
    }
  } else if (mode === "LINE_OUTPUT") {
    const pph = num(line.productionPerHour);
    const hours = num(line.workingHoursPerDay, DEFAULT_WORKING_HOURS) || DEFAULT_WORKING_HOURS;
    const machines = Math.max(0, Math.trunc(line.machinesRequired ?? 0));
    const costMachine = num(line.costPerMachine);
    if (pph < 0 || costMachine < 0) {
      throw new CostingCalcError("COSTING_NEGATIVE_INPUT", "Line output and machine cost cannot be negative.");
    }
    if (hours <= 0 || hours > 24) {
      throw new CostingCalcError(
        "CM_HOURS_INVALID",
        "Working hours per day must be above 0 and at most 24.",
        "working_hours_per_day",
      );
    }
    // Line output is the output of the WHOLE line, so it is never multiplied by machines.
    prodDay = pph * hours;
    dailyCost = machines * costMachine;
    if (dailyCost > 0 && prodDay <= 0) {
      throw new CostingCalcError(
        "CM_LINE_OUTPUT_REQUIRED",
        "Enter the line output per hour (above 0) to cost a line.",
        "production_per_hour",
      );
    }
    cmPc = prodDay > 0 ? dailyCost / prodDay : 0;
  } else if (mode === "DIRECT") {
    const basis = line.directCmBasis ?? "PER_DOZEN";
    if (basis !== "PER_DOZEN" && basis !== "PER_PIECE") {
      throw new CostingCalcError("CM_DIRECT_BASIS_INVALID", "Direct CM must be per dozen or per piece.", "direct_cm_basis");
    }
    if (basis === "PER_DOZEN") {
      const value = num(line.storedCostPerDozen);
      if (value < 0) throw new CostingCalcError("COSTING_NEGATIVE_INPUT", "CM cannot be negative.");
      cmPc = value / TWELVE;
    } else {
      cmPc = num(line.storedCmPerPiece);
      if (cmPc < 0) throw new CostingCalcError("COSTING_NEGATIVE_INPUT", "CM cannot be negative.");
    }
  } else {
    throw new CostingCalcError("CM_MODE_INVALID", `Unknown CM mode: ${String(mode)}`, "cm_mode");
  }

  const costDz = cmPc * TWELVE;
  return {
    cmPerPiece: cmPc,
    costPerDozen: costDz,
    productionPerDay: prodDay,
    dailyLineCost: dailyCost,
    amountPerDozen: costDz * (line.fx ?? 1),
  };
}

export function computeOtherCost(
  line: OtherCostInput,
  ctx: { materialPerDozen: number; manufacturingPerDozen: number; projectedQty: number },
): OtherCostResult {
  if (line.value < 0) {
    throw new CostingCalcError("COSTING_NEGATIVE_INPUT", "Other-cost value cannot be negative.");
  }
  if (String(line.costType || "fixed").trim().toLowerCase() === "percentage") {
    const based = String(line.basedOn || "subtotal").trim().toLowerCase();
    let base: number;
    if (based === "materials" || based === "material") base = ctx.materialPerDozen;
    else if (based === "manufacturing" || based === "cm" || based === "labor") base = ctx.manufacturingPerDozen;
    else base = ctx.materialPerDozen + ctx.manufacturingPerDozen;
    return { amountPerDozen: (Math.max(0, base) * line.value) / 100 };
  }
  const basis = line.costBasis ?? "PER_ORDER"; // old fixed rows were order totals
  if (basis !== "PER_DOZEN" && basis !== "PER_PIECE" && basis !== "PER_ORDER") {
    throw new CostingCalcError("OTHER_COST_BASIS_INVALID", "Other-cost basis is not valid.", "cost_basis");
  }
  const amount = line.value * (line.fx ?? 1);
  if (basis === "PER_DOZEN") return { amountPerDozen: amount };
  if (basis === "PER_PIECE") return { amountPerDozen: amount * TWELVE };
  if (ctx.projectedQty <= 0) {
    throw new CostingCalcError(
      "OTHER_COST_NEEDS_QUANTITY",
      "A per-order fixed cost needs an expected quantity above 0. Use per dozen or per piece instead.",
      "cost_basis",
    );
  }
  return { amountPerDozen: (amount / ctx.projectedQty) * TWELVE };
}

// ---------------------------------------------------------------- pricing
function fixedCommissionPerDozen(value: number, qty: number): number {
  if (qty <= 0) {
    throw new CostingCalcError(
      "COMMISSION_NEEDS_QUANTITY",
      "A fixed commission is for the whole order, so the expected quantity must be above 0.",
      "projected_quantity",
    );
  }
  return (value / qty) * TWELVE;
}

/** Returns [price per dozen, commission inside the price per dozen, commission memo per dozen]. */
export function pricePerDozen(args: {
  costPerDozen: number;
  profitPct: number;
  marginMethod: MarginMethod;
  commission: CommissionInput;
  projectedQty: number;
}): [number, number, number] {
  const { costPerDozen, profitPct, marginMethod, commission, projectedQty } = args;
  if (marginMethod !== "MARKUP_ON_COST" && marginMethod !== "MARGIN_ON_FOB") {
    throw new CostingCalcError("MARGIN_METHOD_INVALID", "Margin method is not valid.", "margin_method");
  }
  const m = profitPct / 100;
  const included = String(commission.mode ?? "EXCLUDE").trim().toUpperCase() === "INCLUDE";
  const ctype = String(commission.type ?? "").trim().toUpperCase();
  const cValue = commission.value ?? 0;
  let pctC = 0;
  let fixedDz = 0;
  if (ctype === "PERCENTAGE" && cValue > 0) {
    pctC = cValue / 100;
  } else if (ctype === "FIXED" && cValue > 0) {
    // An excluded fixed commission never enters the price, so a missing quantity only matters when included.
    if (included || projectedQty > 0) fixedDz = fixedCommissionPerDozen(cValue, projectedQty);
  }

  if (marginMethod === "MARKUP_ON_COST") {
    if (1 + m <= 0) {
      throw new CostingCalcError("MARGIN_INVALID", "Markup % must be greater than -100.", "profit_percentage");
    }
    const beforeComm = costPerDozen * (1 + m);
    const memo = pctC * beforeComm + fixedDz;
    const inside = included ? memo : 0;
    return [beforeComm + inside, inside, memo];
  }

  // MARGIN_ON_FOB: margin and a percentage commission are shares of the buyer (FOB) price.
  if (included && pctC > 0) {
    const denominator = 1 - m - pctC;
    if (denominator <= MIN_FOB_DENOMINATOR) {
      throw new CostingCalcError(
        "MARGIN_ON_FOB_DENOMINATOR",
        "Margin % plus commission % is too high (must stay below 99% of the price).",
        "profit_percentage",
      );
    }
    const price = costPerDozen / denominator;
    return [price, pctC * price, pctC * price];
  }
  const denominator = 1 - m;
  if (denominator <= MIN_FOB_DENOMINATOR) {
    throw new CostingCalcError(
      "MARGIN_ON_FOB_DENOMINATOR",
      "Margin % is too high (must stay below 99% of the price).",
      "profit_percentage",
    );
  }
  if (included && fixedDz > 0) {
    const price = (costPerDozen + fixedDz) / denominator;
    return [price, fixedDz, fixedDz];
  }
  const price = costPerDozen / denominator;
  return [price, 0, pctC * price + fixedDz];
}

export function computeQuotation(data: QuotationInput): QuotationResult {
  const mats = data.materials.map(computeMaterial);
  const cms = data.manufacturing.map(computeCm);
  const matDz = mats.reduce((s, m) => s + m.amountPerDozen, 0);
  const mfgDz = cms.reduce((s, c) => s + c.amountPerDozen, 0);
  const others = data.otherCosts.map((o) =>
    computeOtherCost(o, { materialPerDozen: matDz, manufacturingPerDozen: mfgDz, projectedQty: data.projectedQty }),
  );
  const otherDz = others.reduce((s, o) => s + o.amountPerDozen, 0);
  const totalDz = matDz + mfgDz + otherDz;
  const [priceDz, commInside, commMemo] = pricePerDozen({
    costPerDozen: totalDz,
    profitPct: data.profitPct,
    marginMethod: data.marginMethod ?? "MARKUP_ON_COST",
    commission: data.commission ?? {},
    projectedQty: data.projectedQty,
  });
  const autoPc = priceDz / TWELVE;
  const manual = data.manualPricePerPiece ?? null;
  let pricePc: number;
  let priceDzFinal: number;
  if (manual != null) {
    if (manual < 0) {
      throw new CostingCalcError("PRICE_NEGATIVE", "Quoted price per piece cannot be negative.", "quoted_price_per_piece");
    }
    pricePc = q4(manual); // what the buyer sees is exactly what was typed
    priceDzFinal = pricePc * TWELVE;
  } else {
    pricePc = autoPc;
    priceDzFinal = priceDz;
  }
  const marginPctEffective =
    priceDzFinal > 0
      ? ((priceDzFinal - totalDz - (manual == null ? commInside : 0)) / priceDzFinal) * 100
      : null;
  return {
    materials: mats,
    manufacturing: cms,
    otherCosts: others,
    materialPerDozen: matDz,
    manufacturingPerDozen: mfgDz,
    otherPerDozen: otherDz,
    totalCostPerDozen: totalDz,
    costPerPiece: totalDz / TWELVE,
    commissionPerDozen: commInside,
    commissionMemoPerDozen: commMemo,
    pricePerDozen: priceDzFinal,
    pricePerPiece: pricePc,
    priceIsManual: manual != null,
    marginPctEffective,
  };
}

export type SafeQuotationResult =
  | { ok: true; result: QuotationResult }
  | { ok: false; code: string; message: string; field: string | null };

/** Never throws: the UI shows the message beside the field instead of crashing. */
export function safeComputeQuotation(data: QuotationInput): SafeQuotationResult {
  try {
    return { ok: true, result: computeQuotation(data) };
  } catch (err) {
    if (err instanceof CostingCalcError) {
      return { ok: false, code: err.code, message: err.message, field: err.field };
    }
    throw err;
  }
}

// ---------------------------------------------------------------- Match Buyer Target (reverse formulas)
export interface TargetMatchInput {
  /** Buyer target per piece, already converted to the quotation currency. */
  targetPerPiece: number;
  costPerDozen: number;
  marginMethod: MarginMethod;
  commission?: CommissionInput;
  projectedQty: number;
}

export interface TargetMatchResult {
  /** The margin % to put in the form so the price lands on the target. */
  marginPct: number;
  /** Expected profit per dozen at that margin (negative = loss). */
  profitPerDozen: number;
  isLoss: boolean;
}

/**
 * Reverse of `pricePerDozen`: which margin % gives the buyer target price?
 * Returns an error instead of a number when the target cannot be reached sensibly.
 */
export function marginForTarget(input: TargetMatchInput): TargetMatchResult {
  const { costPerDozen, marginMethod, projectedQty } = input;
  const commission = input.commission ?? {};
  const targetDz = input.targetPerPiece * TWELVE;
  if (!(targetDz > 0)) {
    throw new CostingCalcError("TARGET_INVALID", "Buyer target must be above 0.", "target_price");
  }
  if (!(costPerDozen > 0)) {
    throw new CostingCalcError("TARGET_NEEDS_COST", "Add some cost lines before matching a target.", null);
  }
  const included = String(commission.mode ?? "EXCLUDE").trim().toUpperCase() === "INCLUDE";
  const ctype = String(commission.type ?? "").trim().toUpperCase();
  const cValue = commission.value ?? 0;
  const pctC = included && ctype === "PERCENTAGE" && cValue > 0 ? cValue / 100 : 0;
  const fixedDz = included && ctype === "FIXED" && cValue > 0 ? fixedCommissionPerDozen(cValue, projectedQty) : 0;

  let m: number;
  if (marginMethod === "MARKUP_ON_COST") {
    if (fixedDz > 0) m = (targetDz - fixedDz) / costPerDozen - 1;
    else m = targetDz / (costPerDozen * (1 + pctC)) - 1;
  } else if (fixedDz > 0) {
    m = 1 - (costPerDozen + fixedDz) / targetDz;
  } else {
    m = 1 - pctC - costPerDozen / targetDz;
  }
  // Refuse targets whose margin the server would reject as soon as it is applied.
  if (marginMethod === "MARKUP_ON_COST" && !(m > -1)) {
    throw new CostingCalcError("TARGET_TOO_LOW", "The buyer target does not even cover the fixed commission.", "target_price");
  }
  if (marginMethod === "MARGIN_ON_FOB" && !(costPerDozen / targetDz > 0.01)) {
    throw new CostingCalcError("TARGET_TOO_HIGH", "The buyer target is more than 100 times the cost; check the target price.", "target_price");
  }
  const marginPct = q4(m * 100);
  // Commission that sits inside the target price (markup: c x price-before-commission; FOB: c x price).
  let commissionInside = fixedDz;
  if (pctC > 0) commissionInside = marginMethod === "MARKUP_ON_COST" ? (pctC * targetDz) / (1 + pctC) : pctC * targetDz;
  const profitPerDozen = targetDz - costPerDozen - commissionInside;
  return { marginPct, profitPerDozen, isLoss: marginPct < 0 };
}
