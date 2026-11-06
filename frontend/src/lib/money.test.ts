import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  formatMoney,
  isZeroMoney,
  moneyEquals,
  roundMoney,
  subtractMoney,
  sumMoney,
  sumMoneyBy,
  toMoneyString,
  toMoneyUnits,
} from "./money";

describe("money", () => {
  it("parses API strings, numbers and junk", () => {
    expect(toMoneyUnits("100.5000")).toBe(1_005_000);
    expect(toMoneyUnits("1,234.56")).toBe(12_345_600);
    expect(toMoneyUnits(" -0.00005 ")).toBe(-1);
    expect(toMoneyUnits(".5")).toBe(5_000);
    expect(toMoneyUnits(1.005)).toBe(10_050);
    expect(toMoneyUnits(null)).toBe(0);
    expect(toMoneyUnits("")).toBe(0);
    expect(toMoneyUnits("abc")).toBe(0);
    expect(toMoneyUnits(Number.NaN)).toBe(0);
  });

  it("sums exactly where floats drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney(["0.1", "0.2"])).toBe(0.3);
    expect(sumMoney([0.1, 0.2, "0.3000"])).toBe(0.6);
    expect(sumMoneyBy([{ a: "100.1234" }, { a: "0.0001" }], (r) => r.a)).toBe(100.1235);
    expect(addMoney("1.1", "2.2")).toBe(3.3);
    expect(subtractMoney("0.3", "0.1")).toBe(0.2);
  });

  it("compares at 4 decimals exactly", () => {
    expect(moneyEquals("100.0000", 100)).toBe(true);
    expect(moneyEquals("100.0001", "100")).toBe(false);
    expect(compareMoney("1", "2")).toBe(-1);
    expect(compareMoney("2", "1")).toBe(1);
    expect(compareMoney(0.1 + 0.2, "0.3")).toBe(0);
    expect(isZeroMoney("0.0000")).toBe(true);
    expect(isZeroMoney("-0.00004")).toBe(true);
  });

  it("formats API strings and display text", () => {
    expect(toMoneyString(12.3)).toBe("12.3000");
    expect(toMoneyString("-0.5")).toBe("-0.5000");
    expect(toMoneyString("12.345", 2)).toBe("12.35");
    expect(toMoneyString("-12.345", 2)).toBe("-12.35");
    expect(toMoneyString("-0.001", 2)).toBe("0.00");
    expect(toMoneyString("7", 0)).toBe("7");
    expect(roundMoney("1.23456")).toBe(1.2346);
    expect(formatMoney("1234.5")).toBe("1,234.50");
    expect(formatMoney(1234.5678, { decimals: 4 })).toBe("1,234.5678");
  });
});
