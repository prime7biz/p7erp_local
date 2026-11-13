import { describe, expect, it } from "vitest";

import { formatDate, formatDecimal, formatPercent, formatSigned } from "./formatDecimal";
import { humanizeCode, reasonLabel, reasonLabels } from "./reasonLabels";

describe("reasonLabels", () => {
  it("maps known codes to plain English", () => {
    expect(reasonLabel("SHIFT_ASSUMED_ALL_ACTIVE")).toBe("Shift assumed: all active shifts");
    expect(reasonLabel("PLANNING_MATH_V2_OFF")).toBe("Corrected maths is off");
    expect(reasonLabel("CLOSED_DAY")).toContain("Closed");
  });
  it("falls back to a readable version for unknown codes", () => {
    expect(reasonLabel("SOME_NEW_CODE")).toBe("Some new code");
    expect(humanizeCode("A_B")).toBe("A b");
  });
  it("de-duplicates", () => {
    expect(reasonLabels(["CLOSED_DAY", "CLOSED_DAY"])).toHaveLength(1);
    expect(reasonLabels(null)).toEqual([]);
  });
});

describe("formatDecimal", () => {
  it("formats strings and handles null", () => {
    expect(formatDecimal("12345.678")).toBe("12,346");
    expect(formatDecimal(null)).toBe("—");
    expect(formatDecimal("abc")).toBe("—");
    expect(formatPercent("85.25")).toBe("85.3%");
    expect(formatPercent(null)).toBe("—");
  });
  it("signs differences", () => {
    expect(formatSigned("1200")).toBe("+1,200");
    expect(formatSigned("-300")).toBe("-300");
    expect(formatSigned("0")).toBe("0");
    expect(formatSigned(null)).toBe("—");
  });
  it("formats dates", () => {
    expect(formatDate("2026-11-12")).toBe("12/11/2026");
    expect(formatDate(null)).toBe("—");
  });
});
