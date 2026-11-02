import { describe, expect, it } from "vitest";
import { calculateRoi } from "./roiCalculator";

describe("calculateRoi", () => {
  it("computes hours and salary cost saved from the stated assumptions", () => {
    // 10 people × 6 h/week × 52/12 weeks × 30% = 78 h/month; 45,000 / 208 h = 216.35 BDT/h.
    const r = calculateRoi({ staff: 10, adminHoursPerWeek: 6, monthlySalary: 45_000, reductionPct: 30 });
    expect(r.hoursSavedPerMonth).toBe(78);
    expect(r.costSavedPerMonth).toBe(16_875);
    expect(r.costSavedPerYear).toBe(202_500);
    expect(r.daysSavedPerMonth).toBe(9.8);
  });

  it("treats invalid or negative inputs as zero and caps the reduction at 100%", () => {
    expect(calculateRoi({ staff: -5, adminHoursPerWeek: 6, monthlySalary: 45_000, reductionPct: 30 }).costSavedPerMonth).toBe(0);
    expect(calculateRoi({ staff: Number.NaN, adminHoursPerWeek: 6, monthlySalary: 1, reductionPct: 30 }).hoursSavedPerMonth).toBe(0);
    const capped = calculateRoi({ staff: 1, adminHoursPerWeek: 10, monthlySalary: 20_800, reductionPct: 250 });
    expect(capped.hoursSavedPerMonth).toBe(43);
  });
});
