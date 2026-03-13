export type CommissionMode = "INCLUDE" | "EXCLUDE";
export type CommissionType = "PERCENTAGE" | "FIXED";

export const COMMISSION_MODE_OPTIONS: CommissionMode[] = ["INCLUDE", "EXCLUDE"];
export const COMMISSION_TYPE_OPTIONS: CommissionType[] = ["PERCENTAGE", "FIXED"];

// Keep the existing inquiry shipping list so all create/edit flows stay consistent.
export const SHIPPING_TERM_OPTIONS = [
  "FOB",
  "FOC",
  "FCA",
  "CIF",
  "CFR",
  "EXW",
  "DAP",
  "DDP",
] as const;

export function withLegacyOption(
  currentValue: string | null | undefined,
  options: readonly string[]
): string[] {
  if (currentValue && !options.includes(currentValue)) {
    return [currentValue, ...options];
  }
  return [...options];
}
