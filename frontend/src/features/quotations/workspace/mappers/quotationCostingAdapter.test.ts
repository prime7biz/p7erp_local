import { describe, expect, it } from "vitest";
import type {
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
} from "@/api/client";
import {
  applyResultToManufacturing,
  applyResultToMaterials,
  applyResultToOtherCosts,
  computeWorkspaceCosting,
  headerPatchFromResult,
} from "./quotationCostingAdapter";
import { buildQuotationFullUpdatePayload } from "./buildQuotationFullUpdatePayload";
import { ensureRowKeys, newRowKey, stripRowKey } from "./rowKeys";
import { quotationDirtyValues } from "./quotationDirtyValues";

const header = {
  id: 1,
  customer_id: 1,
  currency: "USD",
  projected_quantity: 1200,
  profit_percentage: "15",
  margin_method: "MARKUP_ON_COST",
  costing_basis: "PER_DOZEN",
  commission_mode: null,
  commission_type: null,
  commission_value: null,
  status: "DRAFT",
} as never;

const mat = (over: Partial<QuotationMaterialLine> = {}): QuotationMaterialLine => ({
  serial_no: 1,
  category_id: 1,
  item_id: 1,
  description: null,
  unit: "kg",
  consumption_per_dozen: "2.5",
  unit_price: "4",
  amount_per_dozen: "0",
  total_amount: "0",
  currency: "USD",
  exchange_rate: "1",
  base_amount: "0",
  local_amount: "0",
  ...over,
});
const cm = (over: Partial<QuotationManufacturingLine> = {}): QuotationManufacturingLine => ({
  serial_no: 1,
  style_part: "Sewing",
  machines_required: 0,
  production_per_hour: "0",
  production_per_day: "0",
  cost_per_machine: "0",
  total_line_cost: "0",
  cost_per_dozen: "0",
  cm_per_piece: "0",
  total_order_cost: "0",
  currency: "USD",
  exchange_rate: "1",
  base_amount: "0",
  local_amount: "0",
  cm_mode: "SMV_CPM",
  smv: "12",
  cpm: "0.05",
  cpm_basis: "EARNED_MIN",
  ...over,
});
const other = (over: Partial<QuotationOtherCostLine> = {}): QuotationOtherCostLine => ({
  serial_no: 1,
  cost_head: "Freight",
  percentage: "0",
  total_amount: "0",
  cost_type: "fixed",
  value: "1.8",
  based_on: "subtotal",
  calculated_amount: "0",
  notes: null,
  currency: "USD",
  exchange_rate: "1",
  base_amount: "0",
  local_amount: "0",
  cost_basis: "PER_DOZEN",
  ...over,
});

function costing(materials: QuotationMaterialLine[], manufacturing: QuotationManufacturingLine[], otherCosts: QuotationOtherCostLine[], manual: number | null = null) {
  const r = computeWorkspaceCosting({ quotation: header, materials, manufacturing, otherCosts, manualPricePerPiece: manual });
  if (!r.ok) throw new Error(r.message);
  return r.result;
}

describe("workspace costing adapter", () => {
  it("prices lines per dozen and per piece", () => {
    const r = costing([mat()], [cm()], [other()]);
    expect(r.materialPerDozen).toBeCloseTo(10, 6);
    expect(r.manufacturingPerDozen).toBeCloseTo(7.2, 6);
    expect(r.otherPerDozen).toBeCloseTo(1.8, 6);
    expect(r.pricePerPiece).toBeCloseTo((19 * 1.15) / 12, 6);
  });

  it("ignores rows that would not be saved (same as the server)", () => {
    const r = costing([mat(), mat({ category_id: null, item_id: null, description: null, unit_price: "999" })], [cm()], []);
    expect(r.materialPerDozen).toBeCloseTo(10, 6);
  });

  it("fills line amounts and returns the same array on a second pass (no render loop)", () => {
    const rows = [mat()];
    const r = costing(rows, [], []);
    const first = applyResultToMaterials(rows, r, 1200);
    expect(first[0]!.amount_per_dozen).toBe("10.0000");
    expect(first[0]!.total_amount).toBe("1000.0000");
    expect(applyResultToMaterials(first, r, 1200)).toBe(first);

    const cms = [cm()];
    const r2 = costing([], cms, []);
    const c1 = applyResultToManufacturing(cms, r2, 1200);
    expect(c1[0]!.cm_per_piece).toBe("0.6000");
    expect(c1[0]!.cost_per_dozen).toBe("7.2000");
    expect(applyResultToManufacturing(c1, r2, 1200)).toBe(c1);

    const ocs = [other()];
    const r3 = costing([], [], ocs);
    const o1 = applyResultToOtherCosts(ocs, r3, 1200, "USD");
    expect(o1[0]!.calculated_amount).toBe("180.0000");
    expect(applyResultToOtherCosts(o1, r3, 1200, "USD")).toBe(o1);
  });

  it("keeps a typed direct CM value instead of overwriting it", () => {
    const rows = [cm({ cm_mode: "DIRECT", direct_cm_basis: "PER_DOZEN", cost_per_dozen: "10", cm_per_piece: "0", smv: null, cpm: null, cpm_basis: null })];
    const r = costing([], rows, []);
    const next = applyResultToManufacturing(rows, r, 1200);
    expect(next[0]!.cost_per_dozen).toBe("10");
    expect(next[0]!.cm_per_piece).toBe("0.8333");
  });

  it("works with quantity 0 and writes zero order totals", () => {
    const q0 = { ...(header as object), projected_quantity: 0 } as never;
    const res = computeWorkspaceCosting({ quotation: q0, materials: [mat()], manufacturing: [], otherCosts: [], manualPricePerPiece: null });
    if (!res.ok) throw new Error(res.message);
    const patch = headerPatchFromResult(res.result, 0);
    expect(patch.quoted_price).toBe("0.0000");
    expect(patch.quoted_price_per_piece).toBe("0.9583");
  });

  it("reports an engine error instead of throwing", () => {
    const res = computeWorkspaceCosting({
      quotation: header,
      materials: [],
      manufacturing: [cm({ cpm_basis: null })],
      otherCosts: [],
      manualPricePerPiece: null,
    });
    expect(res.ok).toBe(false);
  });
});

describe("row keys", () => {
  it("adds keys once and keeps them", () => {
    const rows = [mat(), mat()];
    const keyed = ensureRowKeys(rows);
    expect(keyed[0]!._rowKey).toBeTruthy();
    expect(keyed[0]!._rowKey).not.toBe(keyed[1]!._rowKey);
    expect(ensureRowKeys(keyed)).toBe(keyed);
    expect(newRowKey()).not.toBe(newRowKey());
  });

  it("is removed before saving and ignored by the unsaved-changes check", () => {
    const keyed = ensureRowKeys([mat()]);
    expect("_rowKey" in stripRowKey(keyed[0]!)).toBe(false);
    const payload = buildQuotationFullUpdatePayload({
      quotation: header,
      materials: keyed,
      manufacturing: [],
      otherCosts: [],
      sizeRatios: [],
    });
    expect(JSON.stringify(payload)).not.toContain("_rowKey");

    const base = { quotation: header, manufacturing: [], otherCosts: [], sizeRatios: [], useManualQuotedPrice: false, manualQuotedPrice: "" };
    const a = quotationDirtyValues({ ...base, materials: [mat()] });
    const b = quotationDirtyValues({ ...base, materials: keyed });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("full update payload (dozen-first)", () => {
  const base = { materials: [mat()], manufacturing: [], otherCosts: [], sizeRatios: [] };

  it("sends the costing basis and no price when the price is calculated", () => {
    const p = buildQuotationFullUpdatePayload({ quotation: header, ...base });
    expect(p.costing_basis).toBe("PER_DOZEN");
    expect(p.margin_method).toBe("MARKUP_ON_COST");
    expect(p.quoted_price_per_piece).toBeNull();
  });

  it("sends a manual price per piece only when typed", () => {
    const p = buildQuotationFullUpdatePayload({ quotation: header, ...base, manualPricePerPiece: 2.5 });
    expect(p.quoted_price_per_piece).toBe("2.5000");
  });

  it("leaves legacy quotations without any dozen-first field", () => {
    const legacy = { ...(header as object), costing_basis: null } as never;
    const p = buildQuotationFullUpdatePayload({ quotation: legacy, ...base, manualPricePerPiece: 2.5 });
    expect("costing_basis" in p).toBe(false);
    expect("quoted_price_per_piece" in p).toBe(false);
  });
});
