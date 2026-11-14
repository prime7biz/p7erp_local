import { describe, expect, it } from "vitest";
import {
  IGNORE_TARGET,
  appendNoteLine,
  buildExtraRows,
  coerceExtraValue,
  decodeExtractedText,
  planApplyAll,
  toIsoDate,
  type ExtraRowState,
} from "./extraDetailsLogic";

const OPTIONS = [
  { key: "style_ref", label: "Style ref" },
  { key: "department", label: "Department" },
  { key: "quick_style_name", label: "New style name" },
  { key: "notes", label: "Notes" },
];

describe("buildExtraRows", () => {
  it("keeps only offered suggestions, applies aliases and decodes escaped text", () => {
    const rows = buildExtraRows(
      [
        { label: "Article Code", value: "ART-1", suggested_field: "style_ref", confidence: 0.6 },
        { label: "Article Name", value: "Tee &amp; Polo", suggested_field: "style_name_candidate", confidence: 0.6 },
        { label: "Secret", value: "x", suggested_field: "tenant_id", confidence: 0.5 },
        { label: "Fax", value: "123", suggested_field: null, confidence: 0.5 },
      ],
      OPTIONS,
      { style_name_candidate: "quick_style_name" },
    );
    expect(rows.map((r) => r.target)).toEqual(["style_ref", "quick_style_name", IGNORE_TARGET, IGNORE_TARGET]);
    expect(rows[1]?.value).toBe("Tee & Polo");
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("returns no rows when there are no extras", () => {
    expect(buildExtraRows(undefined, OPTIONS)).toEqual([]);
  });
});

describe("appendNoteLine", () => {
  it("appends without replacing and never duplicates", () => {
    const once = appendNoteLine("Typed by me", "Material", "100% Cotton");
    expect(once).toBe("Typed by me\nMaterial: 100% Cotton");
    expect(appendNoteLine(once, "Material", "100% Cotton")).toBe(once);
  });

  it("turns a multi-line value into a list", () => {
    expect(appendNoteLine("", "Colours", "Navy\nWhite\n")).toBe("Colours:\n- Navy\n- White");
  });
});

describe("coerceExtraValue", () => {
  it("reads whole numbers for quantity", () => {
    expect(coerceExtraValue("quantity", "50,000 pcs")).toEqual({ ok: true, value: 50000 });
    expect(coerceExtraValue("quantity", "about fifty").ok).toBe(false);
  });

  it("refuses numbers whose format depends on the country", () => {
    expect(coerceExtraValue("target_price", "4,50").ok).toBe(false);
    expect(coerceExtraValue("quantity", "1.200 pcs").ok).toBe(false);
    expect(coerceExtraValue("quantity", "1,200 pcs")).toEqual({ ok: true, value: 1200 });
  });

  it("reads prices and currencies", () => {
    expect(coerceExtraValue("target_price", "USD 3.25 / pc")).toEqual({ ok: true, value: "3.25" });
    expect(coerceExtraValue("currency", "usd")).toEqual({ ok: true, value: "USD" });
    expect(coerceExtraValue("currency", "dollars only").ok).toBe(false);
  });

  it("accepts ISO and day-first dates only when valid", () => {
    expect(coerceExtraValue("expected_delivery_date", "15/08/2026")).toEqual({ ok: true, value: "2026-08-15" });
    expect(toIsoDate("2026-08-15")).toBe("2026-08-15");
    expect(toIsoDate("12 Mar 2026")).toBe("2026-03-12");
    expect(toIsoDate("31/02/2026")).toBeNull();
    expect(coerceExtraValue("expected_delivery_date", "next spring").ok).toBe(false);
  });

  it("joins multi-line text for single-line fields", () => {
    expect(coerceExtraValue("department", "Mens\nKnit Tops")).toEqual({ ok: true, value: "Mens, Knit Tops" });
  });

  it("checks customer contact fields", () => {
    expect(coerceExtraValue("contactEmail", "Mail: Jane@Acme.com")).toEqual({ ok: true, value: "jane@acme.com" });
    expect(coerceExtraValue("contactPhone", "+880 1711-122334")).toEqual({ ok: true, value: "8801711122334" });
    expect(coerceExtraValue("countryCode", "+46")).toEqual({ ok: true, value: "+46" });
    expect(coerceExtraValue("website", "two words").ok).toBe(false);
  });

  it("decodes escaped text", () => {
    expect(decodeExtractedText("&lt;b&gt; H&amp;M")).toBe("<b> H&M");
  });
});

describe("planApplyAll", () => {
  const row = (id: string, target: string, status: ExtraRowState["status"] = "pending"): ExtraRowState => ({
    id,
    label: id,
    value: "v",
    suggestedField: target || null,
    target,
    status,
    error: null,
    confidence: 0.5,
  });

  it("applies one row per single-value field, every Notes row, and skips handled rows", () => {
    const ids = planApplyAll([
      row("a", "department"),
      row("b", "department"),
      row("c", "notes"),
      row("d", "notes"),
      row("e", IGNORE_TARGET),
      row("f", "style_ref", "applied"),
    ]);
    expect(ids).toEqual(["a", "c", "d"]);
  });
});
