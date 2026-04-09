/** Calendar YYYY-MM-DD in the local timezone of the parsed string (avoids UTC day shift vs article bylines). */
export function resourceArticleDateToIsoDate(displayDate: string): string {
  const t = Date.parse(displayDate);
  if (Number.isNaN(t)) return new Date().toISOString().slice(0, 10);
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO-8601 instant for Open Graph article times (noon UTC on the parsed calendar day). */
export function resourceArticleDateToIsoDateTime(displayDate: string): string {
  return `${resourceArticleDateToIsoDate(displayDate)}T12:00:00.000Z`;
}
