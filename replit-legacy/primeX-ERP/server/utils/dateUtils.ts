/**
 * Add days to a date and return a new date object
 * @param date - The starting date
 * @param days - Number of days to add
 * @returns A new date with the days added
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate the number of days between two dates
 * @param startDate - The starting date
 * @param endDate - The ending date
 * @returns Number of days between the dates
 */
export function daysBetween(startDate: Date, endDate: Date): number {
  const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
  const diffDays = Math.round(Math.abs((startDate.getTime() - endDate.getTime()) / oneDay));
  return diffDays;
}

/**
 * Format a date as YYYY-MM-DD
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}