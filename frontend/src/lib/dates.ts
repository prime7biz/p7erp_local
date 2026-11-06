/**
 * Calendar-date helpers that use the user's LOCAL date.
 *
 * Why: `new Date().toISOString().slice(0, 10)` returns the UTC date. In Bangladesh (UTC+6) that is
 * still "yesterday" between midnight and 6 AM, so forms defaulted to the wrong day.
 * Use these for date inputs / filters. Keep `toISOString()` only for real UTC timestamps.
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar date of `date` as "YYYY-MM-DD". */
export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Today's local calendar date as "YYYY-MM-DD" (what a user means by "today"). */
export function todayLocalISO(now: Date = new Date()): string {
  return toLocalISODate(now);
}

/** Local date `days` days from today (negative = past), as "YYYY-MM-DD". */
export function addDaysLocalISO(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toLocalISODate(d);
}

/** First day of the current local month as "YYYY-MM-DD". */
export function startOfMonthLocalISO(now: Date = new Date()): string {
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** First day of the current local year as "YYYY-MM-DD". */
export function startOfYearLocalISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-01-01`;
}

/** Current local month as "YYYY-MM" (for `<input type="month">`). */
export function currentMonthLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}
