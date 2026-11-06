/**
 * Financial year helpers (same rules as backend `app/modules/finance/fiscal_year.py`).
 *
 * The start month comes from tenant feature flag `fiscal_year_start_month` (1-12, default 1).
 * A financial year is named after the calendar year it starts in:
 *   start month 7: 2026-07-01 .. 2027-06-30 -> fiscal year 2026, label "2026-27"
 *   start month 1: 2026-01-01 .. 2026-12-31 -> fiscal year 2026, label "2026"
 */

export type FiscalYearOption = {
  fiscalYear: number;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Same as `todayLocalISO` in `lib/dates.ts`; kept under this name for existing callers. */
export { todayLocalISO as localTodayISO } from "./dates";

export function normalizeStartMonth(value: unknown): number {
  const m = Number(value);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : 1;
}

export function fiscalYearOf(dateISO: string, startMonth: number): number {
  const [y = 0, m = 1] = dateISO.split("-").map(Number);
  return m >= startMonth ? y : y - 1;
}

export function fiscalYearLabel(fiscalYear: number, startMonth: number): string {
  return startMonth === 1 ? String(fiscalYear) : `${fiscalYear}-${String(fiscalYear + 1).slice(-2)}`;
}

export function fiscalYearBounds(fiscalYear: number, startMonth: number): { startDate: string; endDate: string } {
  const startDate = isoDate(fiscalYear, startMonth, 1);
  const endYear = startMonth === 1 ? fiscalYear : fiscalYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  return { startDate, endDate: isoDate(endYear, endMonth, lastDay) };
}

/** Current year plus a few earlier ones (newest first) and the next one, for a picker. */
export function fiscalYearOptions(startMonth: number, todayISO: string, yearsBack = 3, yearsForward = 1): FiscalYearOption[] {
  const current = fiscalYearOf(todayISO, startMonth);
  const out: FiscalYearOption[] = [];
  for (let fy = current + yearsForward; fy >= current - yearsBack; fy--) {
    out.push({
      fiscalYear: fy,
      label: fiscalYearLabel(fy, startMonth),
      ...fiscalYearBounds(fy, startMonth),
      isCurrent: fy === current,
    });
  }
  return out;
}

/** Date to use after switching year: today for the current year, otherwise the nearest edge of that year. */
export function defaultDateForFiscalYear(fiscalYear: number, startMonth: number, todayISO: string): string {
  const { startDate, endDate } = fiscalYearBounds(fiscalYear, startMonth);
  if (todayISO >= startDate && todayISO <= endDate) return todayISO;
  return todayISO > endDate ? endDate : startDate;
}
