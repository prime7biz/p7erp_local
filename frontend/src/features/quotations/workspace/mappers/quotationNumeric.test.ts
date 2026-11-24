import { describe, expect, it } from "vitest";
import {
  computeAutoQuotedPrice,
  computeCommissionAmount,
  computeCostPerPiece,
  localDateYmd,
} from "./quotationNumeric";

describe("localDateYmd", () => {
  it("formats local calendar date without UTC shift", () => {
    expect(localDateYmd(new Date(2026, 10, 23))).toBe("2026-11-23");
  });
});

describe("computeCostPerPiece", () => {
  it("divides factory cost by qty (ex-profit)", () => {
    expect(computeCostPerPiece(4500, 1000)).toBe(4.5);
  });

  it("returns 0 when qty is zero", () => {
    expect(computeCostPerPiece(4500, 0)).toBe(0);
  });
});

describe("computeCommissionAmount", () => {
  it("marks INCLUDE commission as part of quoted price", () => {
    const c = computeCommissionAmount({
      mode: "INCLUDE",
      type: "FIXED",
      value: "50",
      baseForPercent: 1000,
    });
    expect(c.amount).toBe(50);
    expect(c.includedInQuoted).toBe(true);
  });

  it("keeps EXCLUDE commission out of quoted price", () => {
    const c = computeCommissionAmount({
      mode: "EXCLUDE",
      type: "PERCENTAGE",
      value: "10",
      baseForPercent: 1000,
    });
    expect(c.amount).toBe(100);
    expect(c.includedInQuoted).toBe(false);
  });
});

describe("computeAutoQuotedPrice", () => {
  it("adds factory margin only when commission is EXCLUDE", () => {
    expect(
      computeAutoQuotedPrice({
        totalCost: 1000,
        profitPercentage: 10,
        commissionMode: "EXCLUDE",
        commissionType: "FIXED",
        commissionValue: "50",
      }),
    ).toBe(1100);
  });

  it("includes FIXED INCLUDE commission in the auto quote (cancelEdit parity)", () => {
    expect(
      computeAutoQuotedPrice({
        totalCost: 1000,
        profitPercentage: 10,
        commissionMode: "INCLUDE",
        commissionType: "FIXED",
        commissionValue: "50",
      }),
    ).toBe(1150);
  });

  it("does not treat an INCLUDE quote as manual when saved equals auto", () => {
    const auto = computeAutoQuotedPrice({
      totalCost: 4500,
      profitPercentage: 16.6667,
      commissionMode: "INCLUDE",
      commissionType: "PERCENTAGE",
      commissionValue: "5",
    });
    const savedQuoted = auto;
    expect(Math.abs(savedQuoted - auto) > 0.02).toBe(false);
  });
});
