import { describe, expect, it } from "vitest";
import {
  bomLinesToMaterialRows,
  comparableHintText,
  copyLines,
  isQuotationCostingLocked,
  sizesToRatioRows,
} from "./wiringDraftRows";

describe("sizesToRatioRows", () => {
  it("splits 100% and the last size takes the remainder", () => {
    const rows = sizesToRatioRows(["S", "M", "L"], 1200);
    expect(rows.map((r) => r.size)).toEqual(["S", "M", "L"]);
    const sum = rows.reduce((a, r) => a + Number(r.ratio_percentage), 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
    expect(rows[0]?.quantity).toBe(400);
  });
  it("returns nothing for an empty scale", () => {
    expect(sizesToRatioRows([" ", ""], 100)).toEqual([]);
  });
});

describe("bomLinesToMaterialRows", () => {
  it("builds draft rows, x12 consumption, skips items already present", () => {
    const { rows, skipped } = bomLinesToMaterialRows({
      lines: [
        { item_id: 5, category: null, item_code: "F1", description: "Fabric", uom: "KG", base_consumption: "0.25", wastage_pct: "5" },
        { item_id: 6, category: null, item_code: "T1", description: "Thread", uom: "CONE", base_consumption: "0.01", wastage_pct: null },
      ],
      existing: [{ item_id: 6 } as never],
      items: [],
      units: [],
      projectedQuantity: 1200,
      quotationCurrency: "USD",
    });
    expect(skipped).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consumption_per_dozen).toBe("3.0000");
    expect(rows[0]?.unit_price).toBe("0");
    expect(rows[0]?.serial_no).toBe(2);
  });
});

describe("helpers", () => {
  it("copyLines drops ids and renumbers", () => {
    expect(copyLines([{ id: 9, serial_no: 4 }, { id: 8, serial_no: 7 }])).toEqual([
      { id: null, serial_no: 1 },
      { id: null, serial_no: 2 },
    ]);
  });
  it("locks approved / sent / converted / superseded", () => {
    expect(isQuotationCostingLocked("SENT", false)).toBe(true);
    expect(isQuotationCostingLocked("DRAFT", true)).toBe(true);
    expect(isQuotationCostingLocked("DRAFT", false)).toBe(false);
  });
  it("shows a hint only when comparable and same currency", () => {
    const hint = { comparable: true, uom: "KG", last_po: { unit_price: "4.5000", currency: "USD", po_code: "PO-1" } };
    expect(comparableHintText(hint, "USD")).toContain("4.5000");
    expect(comparableHintText(hint, "BDT")).toBeNull();
    expect(comparableHintText({ ...hint, comparable: false }, "USD")).toBeNull();
    expect(comparableHintText(undefined, "USD")).toBeNull();
  });
});
