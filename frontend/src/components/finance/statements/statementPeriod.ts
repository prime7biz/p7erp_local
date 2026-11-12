/**
 * Period choice shared by every statement page.
 * The user either picks a financial year (sent as `fiscal_year`) or types From / To dates.
 * The backend refuses both together, so only one of them is ever sent.
 */
import type { StatementQuery } from "@/api/financeStatements";
import {
  defaultDateForFiscalYear,
  fiscalYearBounds,
  fiscalYearOf,
  normalizeStartMonth,
} from "@/lib/fiscalYear";

export interface StatementPeriod {
  /** Set while a whole financial year is chosen; null once the user edits a date. */
  fiscalYear: number | null;
  from: string;
  to: string;
}

/** The financial year that contains `todayISO`, as a whole year. */
export function initialPeriod(startMonth: unknown, todayISO: string): StatementPeriod {
  const month = normalizeStartMonth(startMonth);
  const fy = fiscalYearOf(todayISO, month);
  const { startDate, endDate } = fiscalYearBounds(fy, month);
  return { fiscalYear: fy, from: startDate, to: endDate };
}

/** Picks a whole financial year. */
export function periodForFiscalYear(fiscalYear: number, startMonth: unknown): StatementPeriod {
  const { startDate, endDate } = fiscalYearBounds(fiscalYear, normalizeStartMonth(startMonth));
  return { fiscalYear, from: startDate, to: endDate };
}

/** Query for from/to reports (Trial Balance, Profit & Loss, Ratio Analysis). */
export function rangeQuery(period: StatementPeriod): StatementQuery {
  return period.fiscalYear != null
    ? { fiscal_year: period.fiscalYear }
    : { from_date: period.from, to_date: period.to };
}

/** Start of the financial year that contains `dateISO` (used as the drill-down "from" for a Balance Sheet). */
export function fiscalYearStartOf(dateISO: string, startMonth: unknown): string {
  const month = normalizeStartMonth(startMonth);
  return fiscalYearBounds(fiscalYearOf(dateISO, month), month).startDate;
}

/** As-of date after the user picks a year: today for the current year, else that year's edge. */
export function asOfForFiscalYear(fiscalYear: number, startMonth: unknown, todayISO: string): string {
  return defaultDateForFiscalYear(fiscalYear, normalizeStartMonth(startMonth), todayISO);
}

/** Short readable period text for the report header and print. */
export function describePeriod(period: { from_date?: string | null; to_date?: string | null; as_of_date?: string | null; fiscal_year?: string }): string {
  if (period.as_of_date) return `As at ${period.as_of_date}`;
  if (period.from_date && period.to_date) return `${period.from_date} to ${period.to_date}`;
  return period.fiscal_year ? `Financial year ${period.fiscal_year}` : "";
}
