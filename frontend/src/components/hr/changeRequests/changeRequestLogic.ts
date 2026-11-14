/**
 * Pure helpers for employee change requests (Tier 1 / Tier 2 approval). No React, easy to unit test.
 */
import type { HrChangeKind, HrChangeRequest, HrChangeStatus } from "@/api/models";

export const OPEN_STATUSES: readonly HrChangeStatus[] = ["PENDING_TIER1", "PENDING_TIER2"];

export const STATUS_LABELS: Record<HrChangeStatus, string> = {
  PENDING_TIER1: "Waiting for Tier 1",
  PENDING_TIER2: "Waiting for Tier 2",
  APPLIED: "Approved and applied",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  FAILED: "Could not be applied",
};

export const KIND_LABELS: Record<HrChangeKind, string> = {
  INFO: "Employee information",
  COMPENSATION: "Salary / increment",
  PAY_BENEFITS: "Overtime & allowances",
  TAX_PROFILE: "Income tax profile",
};

export function isOpen(r: Pick<HrChangeRequest, "status">): boolean {
  return OPEN_STATUSES.includes(r.status);
}

/** Request id made once per submit attempt (server pattern ^[A-Za-z0-9_-]{8,64}$). */
export function newChangeRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `chg-${rand.slice(0, 24)}`;
}

/** "department_id" -> "Department id", "bank_account_number" -> "Bank account number". */
export function fieldLabel(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type DiffRow = { field: string; label: string; before: string; after: string; hidden: boolean };

/** Before / after rows. INFO compares field by field; other kinds list the requested values. */
export function diffRows(r: HrChangeRequest): DiffRow[] {
  if (r.details_hidden || !r.payload) return [];
  const masked = new Set(r.masked_fields);
  if (r.kind === "INFO") {
    return Object.keys(r.payload).map((key) => ({
      field: key,
      label: fieldLabel(key),
      before: masked.has(key) ? "Hidden for your role" : displayValue(r.before?.[key]),
      after: masked.has(key) ? "Hidden for your role" : displayValue(r.payload?.[key]),
      hidden: masked.has(key),
    }));
  }
  if (r.kind === "PAY_BENEFITS") {
    const items = (r.payload.benefits as { benefit_code: string; enabled: boolean; amount_override: string | null }[] | undefined) ?? [];
    const prior = new Map(
      ((r.before?.benefits as { benefit_code: string; enabled: boolean; amount_override: string | null }[] | undefined) ?? []).map((b) => [
        b.benefit_code,
        b,
      ]),
    );
    const show = (b?: { enabled: boolean; amount_override: string | null }) =>
      !b ? "—" : `${b.enabled ? "On" : "Off"}${b.amount_override ? ` (${b.amount_override})` : ""}`;
    return items.map((b) => ({
      field: b.benefit_code,
      label: fieldLabel(b.benefit_code.toLowerCase()),
      before: show(prior.get(b.benefit_code)),
      after: show(b),
      hidden: false,
    }));
  }
  const before = r.kind === "TAX_PROFILE" ? ((r.before?.profile as Record<string, unknown> | undefined) ?? {}) : (r.before ?? {});
  return Object.keys(r.payload).map((key) => ({
    field: key,
    label: fieldLabel(key),
    before: key in before ? displayValue(before[key]) : "—",
    after: displayValue(r.payload?.[key]),
    hidden: false,
  }));
}

/** Which tier the viewer can decide now (null = none), following the server's separation rules. */
export function decisionTier(
  r: HrChangeRequest,
  me: { user_id: number; can_tier1: boolean; can_tier2: boolean },
): 1 | 2 | null {
  if (r.requested_by === me.user_id) return null;
  if (r.status === "PENDING_TIER1" && me.can_tier1) return 1;
  if (r.status === "PENDING_TIER2" && me.can_tier2 && r.tier1_by !== me.user_id) return 2;
  return null;
}
