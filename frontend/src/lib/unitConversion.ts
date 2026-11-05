/**
 * Tally-style alternate units: an item has a base unit (stock is kept in it) and an optional
 * alternate unit where 1 alternate = `factor` base units (e.g. 1 Roll = 50 Yard).
 * Documents always store base-unit quantity and base-unit price.
 */

export type LineUnitMode = "base" | "alternate";

/** Valid positive factor from an item / user input, else null. */
export function parseFactor(value: string | number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const round = (n: number, dp: number) => {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
};

/**
 * Convert a qty + unit price typed in the alternate unit into base-unit qty + price.
 * Line value is preserved: altQty × altPrice === baseQty × basePrice (within rounding).
 */
export function alternateToBase(
  altQty: string | null | undefined,
  altPrice: string | null | undefined,
  factor: number,
): { quantity: string; unit_price: string } {
  const q = Number(altQty) || 0;
  const p = Number(altPrice) || 0;
  return {
    quantity: String(round(q * factor, 4)),
    unit_price: String(round(p / factor, 6)),
  };
}
