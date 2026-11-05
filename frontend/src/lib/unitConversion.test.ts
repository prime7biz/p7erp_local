import { describe, expect, it } from "vitest";
import { alternateToBase, parseFactor } from "./unitConversion";

describe("alternate units", () => {
  it("converts rolls to yards and keeps the line value", () => {
    const r = alternateToBase("4", "100", 50);
    expect(r).toEqual({ quantity: "200", unit_price: "2" });
    expect(Number(r.quantity) * Number(r.unit_price)).toBe(400);
  });

  it("rounds awkward factors without losing value", () => {
    const r = alternateToBase("3", "10", 12);
    expect(r.quantity).toBe("36");
    expect(Number(r.quantity) * Number(r.unit_price)).toBeCloseTo(30, 4);
  });

  it("only accepts positive factors", () => {
    expect(parseFactor("50")).toBe(50);
    expect(parseFactor("0")).toBeNull();
    expect(parseFactor("-2")).toBeNull();
    expect(parseFactor(null)).toBeNull();
    expect(parseFactor("abc")).toBeNull();
  });
});
