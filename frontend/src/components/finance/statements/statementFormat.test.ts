import { describe, expect, it } from "vitest";
import {
  formatCell,
  formatDrCr,
  formatIndian,
  formatNet,
  formatWithSide,
  groupIndianDigits,
  isZeroMoney,
  subtractMoneyText,
} from "./statementFormat";

describe("formatIndian (lakh / crore grouping)", () => {
  it("formats zero", () => {
    expect(formatIndian("0")).toBe("0.00");
    expect(formatIndian("0.0000")).toBe("0.00");
  });

  it("groups lakhs and crores like the backend", () => {
    expect(formatIndian("1234567.5")).toBe("12,34,567.50");
    expect(formatIndian("1813863870.26")).toBe("1,81,38,63,870.26");
    expect(formatIndian("999")).toBe("999.00");
    expect(formatIndian("1000")).toBe("1,000.00");
    expect(formatIndian("100000")).toBe("1,00,000.00");
    expect(formatIndian("10000000")).toBe("1,00,00,000.00");
  });

  it("keeps every digit of a very large amount (no JS number)", () => {
    expect(formatIndian("123456789012345.6789")).toBe("12,34,56,78,90,12,345.68");
    expect(formatIndian("90071992547409930.0001", 4)).toBe("90,07,19,92,54,74,09,930.0001");
  });

  it("writes negatives Tally style", () => {
    expect(formatIndian("-1234.5")).toBe("(-)1,234.50");
    expect(formatIndian("-1234.5", 2, "minus")).toBe("-1,234.50");
    expect(formatIndian("-0.001")).toBe("0.00");
  });

  it("rounds half up on the exact decimal", () => {
    expect(formatIndian("1.005")).toBe("1.01");
    expect(formatIndian("2.675")).toBe("2.68");
    expect(formatIndian("1.0049")).toBe("1.00");
    expect(formatIndian("-1.005")).toBe("(-)1.01");
  });

  it("supports other decimal places and empty input", () => {
    expect(formatIndian("1234.5678", 0)).toBe("1,235");
    expect(formatIndian("1234.5678", 4)).toBe("1,234.5678");
    expect(formatIndian(null)).toBe("");
    expect(formatIndian(undefined)).toBe("");
  });

  it("groups digit strings", () => {
    expect(groupIndianDigits("1")).toBe("1");
    expect(groupIndianDigits("1234")).toBe("1,234");
    expect(groupIndianDigits("12345678")).toBe("1,23,45,678");
  });
});

describe("Dr / Cr text", () => {
  it("adds Dr for a positive net and Cr for a negative net", () => {
    expect(formatDrCr("1234.5")).toBe("1,234.50 Dr");
    expect(formatDrCr("-1234.5")).toBe("1,234.50 Cr");
    expect(formatDrCr("12345678.9")).toBe("1,23,45,678.90 Dr");
  });

  it("has no suffix for zero", () => {
    expect(formatDrCr("0")).toBe("0.00");
    expect(formatDrCr("0.0000")).toBe("0.00");
    expect(formatDrCr("-0.001")).toBe("0.00");
  });

  it("formats an absolute amount with the side the API sent", () => {
    expect(formatWithSide("1234.5", "Cr")).toBe("1,234.50 Cr");
    expect(formatWithSide("1234.5", "")).toBe("1,234.50");
    expect(formatWithSide(null, "Dr")).toBe("");
  });

  it("builds the net of two columns exactly", () => {
    expect(formatNet("100.1000", "0.2000")).toBe("99.90 Dr");
    expect(formatNet("0.1000", "0.3000")).toBe("0.20 Cr");
    expect(subtractMoneyText("0.3000", "0.1000")).toBe("0.2000");
  });
});

describe("table cell helpers", () => {
  it("is blank for zero and formatted otherwise", () => {
    expect(formatCell("0.0000")).toBe("");
    expect(formatCell(null)).toBe("");
    expect(formatCell("25.0000")).toBe("25.00");
    expect(isZeroMoney("0.0000")).toBe(true);
    expect(isZeroMoney("0.0001")).toBe(false);
  });
});
