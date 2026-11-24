import { describe, expect, it } from "vitest";
import {
  estimatedSah,
  estimatedValue,
  missingRecommendedFields,
  readinessScore,
} from "./inquiryReadiness";

describe("missingRecommendedFields", () => {
  it("lists every empty recommended field", () => {
    expect(missingRecommendedFields({})).toEqual([
      "Style",
      "Quantity",
      "Target Price",
      "Target Currency",
      "Exchange Rate",
    ]);
  });

  it("returns empty when recommended fields are filled", () => {
    expect(
      missingRecommendedFields({
        style_id: 12,
        quantity: 1000,
        target_price: "2.50",
        target_price_currency: "USD",
        exchange_rate: "110",
      }),
    ).toEqual([]);
  });
});

describe("readinessScore", () => {
  it("is 0 for a blank inquiry", () => {
    expect(readinessScore({})).toBe(0);
  });

  it("scores higher when recommended + product fields are filled", () => {
    const base = readinessScore({
      style_id: 1,
      quantity: 500,
      target_price: "3",
      target_price_currency: "USD",
      exchange_rate: "1",
    });
    const richer = readinessScore({
      style_id: 1,
      quantity: 500,
      target_price: "3",
      target_price_currency: "USD",
      exchange_rate: "1",
      brand: "Acme",
      season: "SS26",
      department: "Men",
      inquiry_type: "QUOTATION",
      contact_person: "Alex",
    });
    expect(base).toBeGreaterThan(0);
    expect(richer).toBeGreaterThan(base);
    expect(richer).toBeLessThanOrEqual(100);
  });
});

describe("estimatedValue", () => {
  it("multiplies qty × target price as a decimal string", () => {
    expect(estimatedValue(100, "2.5")).toBe("250.0000");
  });

  it("returns 0 for invalid inputs", () => {
    expect(estimatedValue(null, "2")).toBe("0");
    expect(estimatedValue(10, "")).toBe("0");
  });
});

describe("estimatedSah", () => {
  it("computes (qty × SMV) / 60", () => {
    expect(estimatedSah(600, "12")).toBe("120.0000");
  });

  it("returns null when inputs are missing", () => {
    expect(estimatedSah(null, "12")).toBeNull();
    expect(estimatedSah(100, null)).toBeNull();
  });
});
