/**
 * Pure helpers for the Manufacturing Intelligence Phase 2 tabs (no React, no fetch) so they are easy to test.
 * Quantities stay decimal STRINGS: validation is done on the text, never with float maths.
 */
import { ApiError } from "@/api/core";
import type { LineBooking, MaterialHold, MaterialPeg, ReservationStatus, RevisionItemInput } from "@/api/mfgPlanning";

// ------------------------------------------------------------------ tabs and flags

export type MfgTabId = "overview" | "materials" | "plan" | "tentative" | "people" | "costcash" | "predictions" | "forward";

export interface MfgPhase2Flags {
  /** mfg_material_allocation_v1 */
  allocation: boolean;
  /** mfg_integrated_planning_v1 */
  integrated: boolean;
  /** mfg_plan_four_eyes (information only, the backend enforces it) */
  fourEyes: boolean;
}

export const NO_PHASE2: MfgPhase2Flags = { allocation: false, integrated: false, fourEyes: false };

/** Strict `=== true` like the backend: a missing flag or any other value is OFF. */
export function readPhase2Flags(flags: Record<string, unknown> | null | undefined): MfgPhase2Flags {
  const f = flags ?? {};
  return {
    allocation: f.mfg_material_allocation_v1 === true,
    integrated: f.mfg_integrated_planning_v1 === true,
    fourEyes: f.mfg_plan_four_eyes === true,
  };
}

/**
 * `costCash`: Phase 3 tab, true only with a Phase 3 flag AND the can_view_finance hint (see phase3Logic).
 * `predictions`: Phase 4 tab, true only with `mfg_predictive_intelligence_v1` (see phase4Logic).
 * `forward`: Phase 5 tab, true only with `mfg_advanced_planning_v1` (see phase5Logic).
 */
export function visibleTabs(
  flags: MfgPhase2Flags,
  opts: { costCash?: boolean; predictions?: boolean; forward?: boolean } = {},
): { id: MfgTabId; label: string }[] {
  const tabs: { id: MfgTabId; label: string }[] = [{ id: "overview", label: "Overview" }];
  if (flags.allocation) tabs.push({ id: "materials", label: "Materials" });
  if (flags.integrated) {
    tabs.push({ id: "plan", label: "Plan changes" });
    tabs.push({ id: "tentative", label: "Tentative demand" });
    tabs.push({ id: "people", label: "People & machines" });
  }
  if (opts.costCash) tabs.push({ id: "costcash", label: "Cost & cash" });
  if (opts.predictions) tabs.push({ id: "predictions", label: "Predictions" });
  if (opts.forward) tabs.push({ id: "forward", label: "Forward plan" });
  return tabs;
}

// ------------------------------------------------------------------ errors

export function errorStatus(e: unknown): number | null {
  return e instanceof ApiError ? e.status : null;
}

export function errorCode(e: unknown): string | null {
  return e instanceof ApiError ? e.code : null;
}

/** Plain-English message for a failed call. The server text is kept because it names the exact problem. */
export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = e instanceof Error && e.message && e.message !== "Request failed" ? e.message : "";
  const status = errorStatus(e);
  if (status === 403) return `You are not allowed to do this${msg ? `: ${msg}` : "."}`;
  if (status === 404) return msg && msg !== "Not Found" ? msg : "Not found, or this feature is switched off for your company.";
  return msg || fallback;
}

/** 409 from allocate-confirm when stock or demand changed after the preview. */
export function isStaleAllocation(e: unknown): boolean {
  return errorStatus(e) === 409 && errorCode(e) === "STALE_STATE";
}

/** New id per submit so a double click or a retry never creates the same thing twice. */
export function newRequestId(): string {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ------------------------------------------------------------------ decimal text checks

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** "12", "12.5" with at most `maxDecimals` places. */
export function isDecimalText(value: string, maxDecimals = 4): boolean {
  const s = value.trim();
  if (!DECIMAL_RE.test(s)) return false;
  const frac = s.split(".")[1] ?? "";
  return frac.length <= maxDecimals;
}

/** Positive decimal text (not all zeros). */
export function isPositiveDecimalText(value: string, maxDecimals = 4): boolean {
  return isDecimalText(value, maxDecimals) && /[1-9]/.test(value);
}

/** Decimal text between 0 and 100 (percent), compared on the text. */
export function isPercentText(value: string, maxDecimals = 2): boolean {
  if (!isDecimalText(value, maxDecimals)) return false;
  const [intPart = "", frac = ""] = value.trim().split(".");
  const whole = intPart.replace(/^0+(?=\d)/, "");
  if (whole.length > 3) return false;
  if (whole.length === 3) return whole === "100" && /^0*$/.test(frac);
  return true;
}

/** Remove trailing zeros so "100.000" and "100" compare equal (text only). */
export function normalizeDecimal(value: string | null | undefined): string {
  if (value == null) return "";
  let s = value.trim();
  if (!s) return "";
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  s = s.replace(/^0+(?=\d)/, "");
  return s;
}

export function sameDecimal(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeDecimal(a) === normalizeDecimal(b);
}

// ------------------------------------------------------------------ dates

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local end of the chosen day as an ISO timestamp (what the backend expects for expires_at). */
export function endOfDayIso(dateIso: string): string {
  return new Date(`${dateIso}T23:59:00`).toISOString();
}

/** Days from `today` (local "YYYY-MM-DD") until `dateIso`, or NaN. */
export function daysUntil(dateIso: string, today: string): number {
  const a = Date.parse(today + "T12:00:00");
  const b = Date.parse(dateIso + "T12:00:00");
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86400000);
}

/** Expiry date for tentative holds / bookings: must be in the future and at most 180 days ahead. */
export function expiryError(dateIso: string, today: string, maxDays = 180): string {
  if (!dateIso) return "Choose an expiry date.";
  const d = daysUntil(dateIso, today);
  if (Number.isNaN(d)) return "Choose a valid expiry date.";
  if (d < 0) return "The expiry date must be today or later.";
  if (d > maxDays) return `The expiry date can be at most ${maxDays} days ahead.`;
  return "";
}

// ------------------------------------------------------------------ materials

export const MANAGER_ONLY_ROLES = ["admin", "manager"] as const;

/** Releasing a hard hold of a confirmed order and moving material between orders: admin / manager only. */
export function canManageHardMaterial(roleName: string | null | undefined): boolean {
  return (MANAGER_ONLY_ROLES as readonly string[]).includes((roleName ?? "").trim().toLowerCase());
}

export const CONFIRMED_ORDER_STATUSES = ["NEW", "CONFIRMED", "IN_PROGRESS"] as const;

export function isConfirmedOrder(status: string | null | undefined): boolean {
  return (CONFIRMED_ORDER_STATUSES as readonly string[]).includes((status ?? "").trim().toUpperCase());
}

export function isHardHold(h: Pick<MaterialHold, "kind" | "status">): boolean {
  return h.kind === "HARD_ATP" || h.status === "HARD";
}

export function isHardPeg(p: Pick<MaterialPeg, "kind">): boolean {
  return (p.kind ?? "").toUpperCase().startsWith("HARD");
}

/** A hard hold / peg of a confirmed order needs the manager role and a reason of at least 10 characters. */
export function releaseNeedsManager(isHard: boolean, orderStatus: string | null | undefined): boolean {
  return isHard && isConfirmedOrder(orderStatus);
}

export const MIN_HARD_REASON = 10;

export function reasonError(reason: string, minLength: number): string {
  if (minLength <= 0) return "";
  return reason.trim().length >= minLength ? "" : `Please write a reason of at least ${minLength} characters.`;
}

/** Only ACTIVE, non-legacy rows can be released from this screen. */
export function holdIsReleasable(h: MaterialHold): boolean {
  return h.status === "ACTIVE" && !h.legacy;
}

export function conflictTone(severity: string): "bad" | "warn" | "neutral" {
  const s = severity.toUpperCase();
  if (s === "CRITICAL" || s === "ERROR" || s === "HIGH") return "bad";
  if (s === "WARNING" || s === "MEDIUM") return "warn";
  return "neutral";
}

export const PRIORITY_RANK_LABEL: Record<number, string> = {
  0: "In production now",
  1: "Firm by plan start",
  2: "Firm by delivery date",
  3: "Tentative",
};

// ------------------------------------------------------------------ plan changes

export interface BookingDraft {
  line_id: string;
  start_date: string;
  planned_end_date: string;
  planned_qty: string;
  reservation_status: ReservationStatus | "";
  operator_count: string;
  target_efficiency_pct: string;
}

export function draftFromBooking(b: LineBooking): BookingDraft {
  const status = (b.reservation_status || "").toUpperCase();
  return {
    line_id: String(b.line_id),
    start_date: b.start_date ?? "",
    planned_end_date: b.planned_end_date ?? "",
    planned_qty: b.planned_qty ?? "",
    reservation_status: status === "DRAFT" || status === "SOFT_BOOKED" || status === "FIRM_BOOKED" ? status : "",
    operator_count: String(b.operator_count ?? ""),
    target_efficiency_pct: b.target_efficiency_pct ?? "",
  };
}

/** UPDATE item with only the fields that differ from the stored booking (backend keeps unsent fields). */
export function buildUpdateItem(b: LineBooking, d: BookingDraft): RevisionItemInput | null {
  const item: RevisionItemInput = { action: "UPDATE", config_id: b.id };
  let changed = false;
  if (d.line_id && Number(d.line_id) !== b.line_id) {
    item.line_id = Number(d.line_id);
    changed = true;
  }
  if (d.start_date && d.start_date !== b.start_date) {
    item.start_date = d.start_date;
    changed = true;
  }
  if (d.planned_end_date && d.planned_end_date !== (b.planned_end_date ?? "")) {
    item.planned_end_date = d.planned_end_date;
    changed = true;
  }
  if (d.planned_qty && !sameDecimal(d.planned_qty, b.planned_qty)) {
    item.planned_qty = d.planned_qty.trim();
    changed = true;
  }
  if (d.reservation_status && d.reservation_status !== (b.reservation_status || "").toUpperCase()) {
    item.reservation_status = d.reservation_status;
    changed = true;
  }
  if (d.operator_count !== "" && Number(d.operator_count) !== b.operator_count) {
    item.operator_count = Number(d.operator_count);
    changed = true;
  }
  if (d.target_efficiency_pct && !sameDecimal(d.target_efficiency_pct, b.target_efficiency_pct)) {
    item.target_efficiency_pct = d.target_efficiency_pct.trim();
    changed = true;
  }
  return changed ? item : null;
}

export interface CreateDraft {
  line_id: string;
  order_id: string;
  start_date: string;
  planned_end_date: string;
  planned_qty: string;
  reservation_status: ReservationStatus;
}

export function buildCreateItem(d: CreateDraft): RevisionItemInput {
  const item: RevisionItemInput = {
    action: "CREATE",
    line_id: Number(d.line_id),
    order_id: Number(d.order_id),
    start_date: d.start_date,
    planned_qty: d.planned_qty.trim(),
    reservation_status: d.reservation_status,
  };
  if (d.planned_end_date) item.planned_end_date = d.planned_end_date;
  return item;
}

/** Field errors for a booking edit / create draft (empty list = OK). */
export function bookingDraftErrors(d: {
  line_id: string;
  start_date: string;
  planned_end_date: string;
  planned_qty: string;
  order_id?: string;
  operator_count?: string;
  target_efficiency_pct?: string;
}): string[] {
  const errs: string[] = [];
  if (d.order_id !== undefined && !(Number(d.order_id) > 0)) errs.push("Choose an order.");
  if (!(Number(d.line_id) > 0)) errs.push("Choose a sewing line.");
  if (!d.start_date) errs.push("Choose a start date.");
  if (d.planned_end_date && d.start_date && d.planned_end_date < d.start_date) errs.push("The end date must be on or after the start date.");
  if (!isPositiveDecimalText(d.planned_qty, 3)) errs.push("Planned quantity must be a number above 0 (up to 3 decimals).");
  if (d.operator_count && !/^\d+$/.test(d.operator_count.trim())) errs.push("Operators must be a whole number.");
  if (d.target_efficiency_pct && !(isPercentText(d.target_efficiency_pct) && isPositiveDecimalText(d.target_efficiency_pct, 2)))
    errs.push("Efficiency must be above 0 and at most 100.");
  return errs;
}

export const MAX_REVISION_ITEMS = 50;
export const MIN_REVISION_REASON = 5;

export function describeItem(item: RevisionItemInput, bookingLabel?: string): string {
  const what = bookingLabel ?? (item.config_id ? `booking #${item.config_id}` : "new booking");
  if (item.action === "CANCEL") return `Cancel ${what}`;
  if (item.action === "CREATE") return `Add a ${item.reservation_status ?? ""} booking`.replace("  ", " ");
  const parts: string[] = [];
  if (item.line_id) parts.push(`line → #${item.line_id}`);
  if (item.start_date) parts.push(`start → ${item.start_date}`);
  if (item.planned_end_date) parts.push(`end → ${item.planned_end_date}`);
  if (item.planned_qty) parts.push(`qty → ${item.planned_qty}`);
  if (item.reservation_status) parts.push(`status → ${item.reservation_status}`);
  if (item.operator_count != null) parts.push(`operators → ${item.operator_count}`);
  if (item.target_efficiency_pct) parts.push(`efficiency → ${item.target_efficiency_pct}%`);
  return `Change ${what}: ${parts.join(", ")}`;
}

/** 409 because the row on screen is out of date (lock version / status), not a business conflict such as an overlap. */
export function isStaleError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return errorStatus(e) === 409 && /changed since|changed, reload|reload|inactive/i.test(msg);
}

/** Message for an approve failure (409 stale / 403 four-eyes / 422 firm on unconfirmed order). */
export function approveErrorMessage(e: unknown): string {
  const status = errorStatus(e);
  const msg = e instanceof Error ? e.message : "";
  if (status === 409 && msg.startsWith("PROPOSAL_ENTERED_FROZEN_ZONE"))
    return "A scheduler booking in this change now starts inside the frozen zone, so nothing was applied. Run the scheduler preview again (Forward plan tab) and send a new proposal.";
  if (status === 409)
    return `This change or the line plan changed since you opened it; the list was reloaded - review it again. (${msg})`;
  if (status === 403 && /four-eyes/i.test(msg)) return "Four-eyes rule: someone other than the proposer must approve this change.";
  return friendlyError(e);
}

// ------------------------------------------------------------------ tentative demand

export interface TentativeDraft {
  source: "INQUIRY" | "QUOTATION";
  source_id: string;
  line_id: string;
  start_date: string;
  planned_end_date: string;
  planned_qty: string;
  confidence_pct: string;
  expires_on: string;
  notes: string;
}

export function tentativeDraftErrors(d: TentativeDraft, today: string, opts: { confidenceDefault: boolean; isCreate: boolean }): string[] {
  const errs: string[] = [];
  if (opts.isCreate && !(Number(d.source_id) > 0)) errs.push(d.source === "INQUIRY" ? "Choose an inquiry." : "Choose a quotation.");
  if (!(Number(d.line_id) > 0)) errs.push("Choose a sewing line.");
  if (!d.start_date) errs.push("Choose a start date.");
  if (d.planned_end_date && d.start_date && d.planned_end_date < d.start_date) errs.push("The end date must be on or after the start date.");
  if (!isPositiveDecimalText(d.planned_qty, 3)) errs.push("Planned quantity must be a number above 0 (up to 3 decimals).");
  if (d.confidence_pct.trim()) {
    if (!isPercentText(d.confidence_pct)) errs.push("Confidence must be between 0 and 100.");
  } else if (opts.isCreate && !opts.confidenceDefault) {
    errs.push("Enter a confidence % (no default is set for this stage).");
  }
  if (d.expires_on) {
    const e = expiryError(d.expires_on, today);
    if (e) errs.push(e);
  }
  return errs;
}

export const NOT_COUNTED_HELP: Record<string, string> = {
  EXPIRED: "The booking passed its expiry date.",
  CONVERTED: "An order now exists, so its firm booking counts instead.",
  QUOTATION_BOOKING_EXISTS: "A quotation booking for the same inquiry already counts.",
  SUPERSEDED_QUOTATION: "A newer quotation revision replaced this one.",
};

// ------------------------------------------------------------------ people & machines

export interface AssignmentDraft {
  owner_id: number | null;
  sewing_line_id: string;
  shift_id: string;
  role: string;
  valid_from: string;
  valid_to: string;
  notes: string;
}

export function assignmentDraftErrors(d: AssignmentDraft, kind: "employees" | "machines", isCreate: boolean): string[] {
  const errs: string[] = [];
  if (isCreate && !(d.owner_id && d.owner_id > 0)) errs.push(kind === "employees" ? "Choose an employee." : "Choose a machine.");
  if (!(Number(d.sewing_line_id) > 0)) errs.push("Choose a sewing line.");
  if (kind === "employees" && !d.role) errs.push("Choose a role.");
  if (!d.valid_from) errs.push("Choose the first day.");
  if (d.valid_to && d.valid_from && d.valid_to < d.valid_from) errs.push("The last day must be on or after the first day.");
  return errs;
}

/** PATCH body with only the changed fields; null when nothing changed. */
export function assignmentPatch(
  current: { sewing_line_id: number; shift_id?: number | null; role?: string; valid_from: string; valid_to: string | null; notes: string | null; lock_version: number },
  d: AssignmentDraft,
  kind: "employees" | "machines",
): (Record<string, unknown> & { expected_lock_version: number }) | null {
  const body: Record<string, unknown> & { expected_lock_version: number } = { expected_lock_version: current.lock_version };
  let changed = false;
  if (Number(d.sewing_line_id) !== current.sewing_line_id) {
    body.sewing_line_id = Number(d.sewing_line_id);
    changed = true;
  }
  if (kind === "employees") {
    if (d.shift_id && Number(d.shift_id) !== (current.shift_id ?? null)) {
      body.shift_id = Number(d.shift_id);
      changed = true;
    }
    if (d.role && d.role !== current.role) {
      body.role = d.role;
      changed = true;
    }
  }
  if (d.valid_from !== current.valid_from) {
    body.valid_from = d.valid_from;
    changed = true;
  }
  if (d.valid_to && d.valid_to !== (current.valid_to ?? "")) {
    body.valid_to = d.valid_to;
    changed = true;
  }
  if ((d.notes.trim() || null) !== (current.notes ?? null) && d.notes.trim()) {
    body.notes = d.notes.trim();
    changed = true;
  }
  return changed ? body : null;
}

// ------------------------------------------------------------------ style SMV

export const SMV_SOURCES = ["OB", "IE_STUDY", "HISTORICAL", "BUYER", "ESTIMATE"] as const;
export const SMV_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;

export const SMV_SOURCE_LABEL: Record<string, string> = {
  OB: "Operation bulletin",
  IE_STUDY: "IE time study",
  HISTORICAL: "Past production",
  BUYER: "Buyer given",
  ESTIMATE: "Estimate",
};

export function smvDraftErrors(d: { smv: string; source: string; confidence: string; reason: string }): string[] {
  const errs: string[] = [];
  if (!isPositiveDecimalText(d.smv, 4)) errs.push("SMV must be a number above 0 (up to 4 decimals).");
  else if (normalizeDecimal(d.smv).split(".")[0]!.length > 3) errs.push("SMV must be below 1000 minutes.");
  if (!(SMV_SOURCES as readonly string[]).includes(d.source)) errs.push("Choose where the SMV comes from.");
  if (!(SMV_CONFIDENCES as readonly string[]).includes(d.confidence)) errs.push("Choose a confidence.");
  if (d.reason.trim().length < 5) errs.push("Write a reason of at least 5 characters.");
  return errs;
}
