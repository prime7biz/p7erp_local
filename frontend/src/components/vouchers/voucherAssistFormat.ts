/**
 * Show a balance the Tally way: "1,250.00 Dr" / "300.00 Cr".
 * `signed` is in the account's normal direction (as stored on chart_of_accounts.balance),
 * so a negative value means the balance has moved to the opposite side.
 */
export function formatDrCr(signed: string | number, normalBalance: string): string {
  const n = Number(signed) || 0;
  const normalSide = normalBalance === "credit" ? "Cr" : "Dr";
  const otherSide = normalSide === "Dr" ? "Cr" : "Dr";
  const amount = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount} ${n >= 0 ? normalSide : otherSide}`;
}

export function formatMoney(value: string | number | null | undefined): string {
  return (Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-07-01" -> "1 Jul 2026" */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
