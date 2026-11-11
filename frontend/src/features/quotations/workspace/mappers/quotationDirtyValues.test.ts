import { describe, expect, it } from "vitest";
import type {
  QuotationDetailResponse,
  QuotationMaterialLine,
  QuotationOtherCostLine,
} from "@/api/client";
import { formSnapshot } from "@/hooks/useFormDirty";
import { quotationDirtyValues, type QuotationDirtyInput } from "./quotationDirtyValues";

const header = {
  id: 7,
  customer_id: 3,
  status: "DRAFT",
  projected_quantity: "1200",
  profit_percentage: "15",
  material_cost: null,
  total_cost: null,
  quoted_price: null,
  notes: null,
} as unknown as QuotationDetailResponse;
const material = {
  serial_no: 1,
  item_id: 9,
  consumption_per_dozen: "2.5",
  unit_price: "3.20",
  amount_per_dozen: "8.0000",
  total_amount: "800.0000",
  base_amount: "800.0000",
} as unknown as QuotationMaterialLine;
const otherCost = {
  serial_no: 1,
  cost_head: "Washing",
  cost_type: "percentage",
  value: "5",
  percentage: "5.0000",
  calculated_amount: "0",
  total_amount: "0",
} as unknown as QuotationOtherCostLine;

function input(patch: Partial<QuotationDirtyInput> = {}): QuotationDirtyInput {
  return {
    quotation: header,
    materials: [material],
    manufacturing: [],
    otherCosts: [otherCost],
    sizeRatios: [],
    useManualQuotedPrice: false,
    manualQuotedPrice: "",
    ...patch,
  };
}

const snap = (i: QuotationDirtyInput) => formSnapshot(quotationDirtyValues(i));

describe("quotationDirtyValues", () => {
  it("ignores the totals the workspace recalculates after loading", () => {
    const recalculated = input({
      quotation: { ...header, material_cost: "800.00", total_cost: "840.00", quoted_price: "966.00" },
      materials: [{ ...material, amount_per_dozen: "8.00", total_amount: "800.00", base_amount: "800.00" }],
      otherCosts: [{ ...otherCost, percentage: "5", calculated_amount: "40.00", total_amount: "40.00" }],
    });
    expect(snap(recalculated)).toBe(snap(input()));
  });

  it("ignores a status change made by Submit / Approve", () => {
    expect(snap(input({ quotation: { ...header, status: "SUBMITTED" } }))).toBe(snap(input()));
  });

  it("sees values the user types: header fields, line inputs, added lines and the manual price", () => {
    const base = snap(input());
    expect(snap(input({ quotation: { ...header, notes: "Rush order" } }))).not.toBe(base);
    expect(snap(input({ materials: [{ ...material, unit_price: "3.50" }] }))).not.toBe(base);
    expect(snap(input({ otherCosts: [{ ...otherCost, value: "6" }] }))).not.toBe(base);
    expect(snap(input({ materials: [material, { ...material, serial_no: 2 }] }))).not.toBe(base);
    expect(snap(input({ useManualQuotedPrice: true, manualQuotedPrice: "9.50" }))).not.toBe(base);
  });
});
