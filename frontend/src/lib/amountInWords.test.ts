import { describe, expect, it } from "vitest";
import { amountInWords, formatLakh, integerInWords } from "./amountInWords";

describe("integerInWords (lakh / crore)", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [19, "Nineteen"],
    [45, "Forty Five"],
    [100, "One Hundred"],
    [999, "Nine Hundred Ninety Nine"],
    [1000, "One Thousand"],
    [125000, "One Lakh Twenty Five Thousand"],
    [10_000_000, "One Crore"],
    [123_456_789, "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine"],
  ])("%d", (n, words) => {
    expect(integerInWords(n)).toBe(words);
  });
});

describe("amountInWords", () => {
  it("writes Taka and Paisa", () => {
    expect(amountInWords(125000.5)).toBe("Taka One Lakh Twenty Five Thousand and Fifty Paisa Only");
    expect(amountInWords(1001)).toBe("Taka One Thousand One Only");
  });
  it("rounds to two decimals", () => {
    expect(amountInWords(10.005)).toBe("Taka Ten and One Paisa Only");
  });
  it("supports other currencies", () => {
    expect(amountInWords(20.25, "USD")).toBe("US Dollars Twenty and Twenty Five Cents Only");
  });
});

describe("formatLakh", () => {
  it("groups like a Bangladeshi cheque", () => {
    expect(formatLakh(1250000.5)).toBe("12,50,000.50");
    expect(formatLakh(999)).toBe("999.00");
    expect(formatLakh(123456789)).toBe("12,34,56,789.00");
  });
});
