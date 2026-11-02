/** Time-and-cost estimate behind the public ROI calculator. All inputs are user-editable assumptions. */
export type RoiInput = {
  /** People who spend part of their week on manual admin (merchandisers, store, accounts, HR). */
  staff: number;
  /** Hours per person per week on re-typing, spreadsheets, chasing status and reconciling. */
  adminHoursPerWeek: number;
  /** Average monthly salary per person (BDT). */
  monthlySalary: number;
  /** Share of that admin time the ERP removes, 0–100. */
  reductionPct: number;
};

export type RoiResult = {
  hoursSavedPerMonth: number;
  costSavedPerMonth: number;
  costSavedPerYear: number;
  /** Working days of time returned to the team each month (8-hour days). */
  daysSavedPerMonth: number;
};

const WEEKS_PER_MONTH = 52 / 12;
/** 26 working days × 8 hours, the usual Bangladesh full-time month. */
const WORK_HOURS_PER_MONTH = 208;

const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min);

export function calculateRoi(input: RoiInput): RoiResult {
  const staff = clamp(input.staff, 0, 10_000);
  const hours = clamp(input.adminHoursPerWeek, 0, 60);
  const salary = clamp(input.monthlySalary, 0, 10_000_000);
  const reduction = clamp(input.reductionPct, 0, 100) / 100;

  const hoursSavedPerMonth = staff * hours * WEEKS_PER_MONTH * reduction;
  const costSavedPerMonth = hoursSavedPerMonth * (salary / WORK_HOURS_PER_MONTH);
  return {
    hoursSavedPerMonth: Math.round(hoursSavedPerMonth),
    costSavedPerMonth: Math.round(costSavedPerMonth),
    costSavedPerYear: Math.round(costSavedPerMonth * 12),
    daysSavedPerMonth: Math.round((hoursSavedPerMonth / 8) * 10) / 10,
  };
}
