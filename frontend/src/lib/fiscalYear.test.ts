import { describe, expect, it } from "vitest";
import {
  defaultDateForFiscalYear,
  fiscalYearBounds,
  fiscalYearLabel,
  fiscalYearOf,
  fiscalYearOptions,
  localTodayISO,
  normalizeStartMonth,
} from "./fiscalYear";

describe("fiscal year helpers", () => {
  it("matches backend fiscal_year_of / bounds / label", () => {
    expect(fiscalYearOf("2026-06-30", 7)).toBe(2025);
    expect(fiscalYearOf("2026-07-01", 7)).toBe(2026);
    expect(fiscalYearOf("2026-03-01", 1)).toBe(2026);
    expect(fiscalYearBounds(2026, 7)).toEqual({ startDate: "2026-07-01", endDate: "2027-06-30" });
    expect(fiscalYearBounds(2026, 1)).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(fiscalYearBounds(2023, 3)).toEqual({ startDate: "2023-03-01", endDate: "2024-02-29" });
    expect(fiscalYearLabel(2026, 7)).toBe("2026-27");
    expect(fiscalYearLabel(2026, 1)).toBe("2026");
  });

  it("uses the local calendar day, not UTC", () => {
    expect(localTodayISO(new Date(2026, 10, 5, 2, 30))).toBe("2026-11-05");
  });

  it("falls back to January for bad start months", () => {
    expect(normalizeStartMonth(undefined)).toBe(1);
    expect(normalizeStartMonth("7")).toBe(7);
    expect(normalizeStartMonth(13)).toBe(1);
  });

  it("lists years newest first and marks the current one", () => {
    const opts = fiscalYearOptions(7, "2026-11-05", 1, 1);
    expect(opts.map((o) => o.label)).toEqual(["2027-28", "2026-27", "2025-26"]);
    expect(opts.find((o) => o.isCurrent)?.label).toBe("2026-27");
  });

  it("picks today for the current year, otherwise the nearest edge", () => {
    expect(defaultDateForFiscalYear(2026, 7, "2026-11-05")).toBe("2026-11-05");
    expect(defaultDateForFiscalYear(2025, 7, "2026-11-05")).toBe("2026-06-30");
    expect(defaultDateForFiscalYear(2027, 7, "2026-11-05")).toBe("2027-07-01");
  });
});
