/**
 * Pure helpers for the Manufacturing Intelligence Phase 4 "Predictions" tab (no React, no fetch).
 * Numbers stay decimal STRINGS from the backend; helpers only read and label them, never do maths that is shown as a fact.
 */
import type {
  DeliveryForecastResponse,
  PredictionExplainResponse,
  Recommendation,
  RecommendationDecision,
  RecommendationDecisionInput,
} from "@/api/mfgPredictive";

import { formatDate, formatDecimal } from "../formatDecimal";
import { windowDays, type ChipTone } from "../panelLogic";
import { errorStatus } from "../phase2/phase2Logic";
import type { MfgTabId } from "../phase2/phase2Logic";
import { ratioToPercentText } from "../phase3/phase3Logic";
import { humanizeCode } from "../reasonLabels";

/** Shown on every prediction card. */
export const STATISTICS_NOTICE = "Statistical estimate from your own history - never changes plans.";

// ------------------------------------------------------------------ flags and tab gating

export interface MfgPhase4Flags {
  /** mfg_predictive_intelligence_v1: the Predictions tab */
  predictions: boolean;
  /** mfg_predictive_ai_text_v1: "Explain" button (AI wording); only together with predictions */
  aiText: boolean;
}

export const NO_PHASE4: MfgPhase4Flags = { predictions: false, aiText: false };

/** Strict `=== true` like the backend: a missing flag or any other value is OFF. */
export function readPhase4Flags(flags: Record<string, unknown> | null | undefined): MfgPhase4Flags {
  const f = flags ?? {};
  const predictions = f.mfg_predictive_intelligence_v1 === true;
  return { predictions, aiText: predictions && f.mfg_predictive_ai_text_v1 === true };
}

const TAB_IDS: MfgTabId[] = ["overview", "materials", "plan", "tentative", "people", "costcash", "predictions", "forward"];

/** Spelled-out names used in alert / recommendation links (e.g. `?tab=plan-changes`). */
const TAB_ALIASES: Record<string, MfgTabId> = {
  "plan-changes": "plan",
  "tentative-demand": "tentative",
  "people-machines": "people",
  "cost-cash": "costcash",
  "forward-plan": "forward",
};

/** `?tab=` from the URL (Control Tower deep links). Unknown values are ignored. */
export function parseTabParam(raw: string | null | undefined): MfgTabId | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (TAB_ALIASES[v]) return TAB_ALIASES[v]!;
  return (TAB_IDS as string[]).includes(v) ? (v as MfgTabId) : null;
}

/** `?finding=` from the URL: a positive whole number, else null. */
export function parseFindingParam(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------------ labels and tones

export const KIND_LABEL: Record<string, string> = {
  DELIVERY_RISK: "Delivery risk",
  LATE_MATERIAL: "Late material",
  CAPACITY_OVERLOAD: "Line overloaded",
  LINE_IDLE: "Line idle",
  OUTPUT_DROP: "Output drop",
  QUALITY_SPIKE: "Rejection spike",
};

export function kindLabel(kind: string | null | undefined): string {
  return KIND_LABEL[(kind ?? "").toUpperCase()] ?? humanizeCode(kind ?? "");
}

export function severityTone(severity: string | null | undefined): ChipTone {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "bad";
    case "high":
      return "warn";
    default:
      return "info";
  }
}

export function severityLabel(severity: string | null | undefined): string {
  const s = (severity ?? "").toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

export const CONFIDENCE_LABEL: Record<string, string> = { HIGH: "High confidence", MEDIUM: "Medium confidence", LOW: "Low confidence" };

export function confidenceTone(c: string | null | undefined): ChipTone {
  const s = (c ?? "").toUpperCase();
  if (s === "HIGH") return "good";
  if (s === "MEDIUM") return "info";
  return "warn";
}

export function confidenceLabel(c: string | null | undefined): string {
  const s = (c ?? "").toUpperCase();
  return CONFIDENCE_LABEL[s] ?? (s ? humanizeCode(s) : "—");
}

export const EFFICIENCY_SOURCE_LABEL: Record<string, string> = {
  EMPIRICAL: "From history",
  BLENDED: "History + plan",
  PLANNED: "Plan only",
  MIXED: "Mixed (some lines plan only)",
  UNKNOWN: "Unknown",
};

export const EFFICIENCY_SOURCE_HELP: Record<string, string> = {
  EMPIRICAL: "Mostly your recorded output (enough production days).",
  BLENDED: "A mix of recorded output and the planned efficiency.",
  PLANNED: "Planned efficiency only: fewer than 10 production days of history.",
  UNKNOWN: "No plan and no history for this line.",
};

export function efficiencySourceTone(source: string | null | undefined): ChipTone {
  const s = (source ?? "").toUpperCase();
  if (s === "EMPIRICAL") return "good";
  if (s === "BLENDED" || s === "MIXED") return "info";
  if (s === "PLANNED") return "warn";
  return "neutral";
}

export function efficiencySourceLabel(source: string | null | undefined): string {
  const s = (source ?? "").toUpperCase();
  return EFFICIENCY_SOURCE_LABEL[s] ?? (s ? humanizeCode(s) : "—");
}

export const LATENESS_SOURCE_LABEL: Record<string, string> = {
  NOT_EVALUATED: "Not evaluated",
  NONE: "No material wait",
  VENDOR_CATEGORY: "Supplier + category history",
  VENDOR: "Supplier history",
  CATEGORY: "Category history",
  TENANT: "Company-wide supplier history",
  UNKNOWN: "Not enough supplier history",
};

export function latenessSourceLabel(source: string | null | undefined): string {
  const s = (source ?? "").toUpperCase();
  return LATENESS_SOURCE_LABEL[s] ?? (s ? humanizeCode(s) : "—");
}

export const MATERIAL_STATUS_LABEL: Record<string, string> = {
  NOT_EVALUATED: "Not evaluated",
  NONE_NEEDED: "Material ready - no wait",
  DATED: "Waiting for purchase orders (dates estimated)",
  UNKNOWN: "Unknown - material date cannot be estimated",
};

export function materialStatusTone(status: string | null | undefined): ChipTone {
  const s = (status ?? "").toUpperCase();
  if (s === "NONE_NEEDED") return "good";
  if (s === "DATED") return "info";
  if (s === "UNKNOWN") return "warn";
  return "neutral";
}

export const DRIVER_LABEL: Record<string, string> = {
  MATERIAL: "Material arrival",
  EFFICIENCY: "Line efficiency",
  LOAD: "Line load",
};

export const ETA_SOURCE_LABEL: Record<string, string> = {
  PO_EXPECTED_DATE: "PO expected date",
  ORDER_DATE_PLUS_LEAD_TIME: "PO date + lead time",
};

export const DECISION_LABEL: Record<string, string> = {
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  IGNORED: "Ignored (no decision by the deadline)",
};

export function decisionTone(d: string | null | undefined): ChipTone {
  const s = (d ?? "").toUpperCase();
  if (s === "ACCEPTED") return "good";
  if (s === "REJECTED") return "neutral";
  return "warn";
}

export const OUTCOME_LABEL: Record<string, string> = {
  MET: "Outcome: met",
  NOT_MET: "Outcome: not met",
  UNKNOWN: "Outcome: unknown",
};

export const METRIC_LABEL: Record<string, string> = {
  EFFICIENCY: "Line efficiency",
  REJECTION_RATE: "Rejection rate",
  HOURLY_OUTPUT: "Hourly output",
};

export function metricLabel(metric: string | null | undefined): string {
  const s = (metric ?? "").toUpperCase();
  return METRIC_LABEL[s] ?? humanizeCode(s);
}

/** Anomaly values: percent for efficiency / rejection rate, pieces for hourly output. */
export function anomalyValue(metric: string, value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return metric.toUpperCase() === "HOURLY_OUTPUT" ? `${formatDecimal(value)} pcs` : `${formatDecimal(value, 2)}%`;
}

export function anomalyDirectionLabel(metric: string, direction: string): string {
  const d = direction.toUpperCase();
  if (metric.toUpperCase() === "REJECTION_RATE") return d === "HIGH" ? "Unusually high" : "Unusually low";
  return d === "LOW" ? "Unusually low" : "Unusually high";
}

// ------------------------------------------------------------------ delivery forecast

/** "73 %" / "< 5 %" from the backend, else the probability as a percent; null = not enough history. */
export function probabilityText(f: Pick<DeliveryForecastResponse, "on_time_probability" | "probability_display">): string | null {
  if (f.probability_display) return f.probability_display;
  const pct = ratioToPercentText(f.on_time_probability);
  return pct != null ? `${formatDecimal(pct)} %` : null;
}

export function isFixedBands(f: Pick<DeliveryForecastResponse, "spread_mode" | "reason_codes" | "on_time_probability">): boolean {
  return f.spread_mode === "FIXED_BANDS" || (f.on_time_probability == null && f.reason_codes.includes("INSUFFICIENT_HISTORY"));
}

export const NOT_ENOUGH_HISTORY = "Not enough history for a probability yet";

// ------------------------------------------------------------------ anomalies window

export const ANOMALY_MAX_DAYS = 31;

/** Error text for the anomaly date window, or "" when it is fine (at most 31 days, From not after To). */
export function anomalyWindowError(from: string, to: string, max = ANOMALY_MAX_DAYS): string {
  const days = windowDays(from, to);
  if (!from || !to || Number.isNaN(days)) return "Choose both dates.";
  if (days < 1) return "From must not be after To.";
  if (days > max) return `The window can be at most ${max} days (now ${days}).`;
  return "";
}

// ------------------------------------------------------------------ recommendations

export function canDecide(r: Pick<Recommendation, "status" | "decision_status">): boolean {
  return r.status === "OPEN" && !r.decision_status;
}

/** The decision POST takes ACCEPT / REJECT; the stored value is ACCEPTED / REJECTED. */
export function toDecisionInput(d: RecommendationDecision): RecommendationDecisionInput {
  return d === "ACCEPTED" ? "ACCEPT" : "REJECT";
}

export function isAiWording(r: Pick<PredictionExplainResponse, "source" | "tag">): boolean {
  return (r.source ?? "").toLowerCase() === "ai" || r.tag === "AI_TEXT";
}

export const DECISION_NOTE_MAX = 500;
export const REJECT_NOTE_MIN = 5;

/** Reject needs a note (at least 5 characters); every note is at most 500 characters. */
export function decisionNoteError(decision: RecommendationDecision, note: string): string {
  const s = note.trim();
  if (decision === "REJECTED" && s.length < REJECT_NOTE_MIN) return `Please write why you reject it (at least ${REJECT_NOTE_MIN} characters).`;
  if (s.length > DECISION_NOTE_MAX) return `The note can be at most ${DECISION_NOTE_MAX} characters (now ${s.length}).`;
  return "";
}

/** Message for a failed GET: 404 = switched off, 403 = no access, 422 = bad filter, else the server text. */
export function loadErrorText(status: number | null, message: string, what: string): string {
  if (status === 404) return `${what}: predictions are switched off for your company. An admin can turn them on in Settings → Configuration.`;
  if (status === 403) return `${what}: you do not have access${message ? ` (${message})` : ""}.`;
  if (status === 422) return message ? `Please check the filters: ${message}` : "Please check the filters.";
  return message || `${what}: could not load. Please try again.`;
}

/** Message for a failed decision / explain call. 404 may also mean the server does not offer the action yet. */
export function actionError(e: unknown, what: string): string {
  const status = errorStatus(e);
  const msg = e instanceof Error && e.message && e.message !== "Request failed" ? e.message : "";
  if (status === 403)
    return `You are not allowed to ${what}. Recording decisions needs admin / manager or the "confirm AI agent actions" permission${msg ? ` (${msg})` : ""}.`;
  if (status === 404) return `Could not ${what}: the finding was not found, predictions are switched off, or this action is not available on the server yet.`;
  if (status === 409) return msg || `Could not ${what}: the finding is no longer open. The list was reloaded.`;
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return msg || `Could not ${what}. Please try again.`;
}

export interface ScreenLink {
  label: string;
  /** App route to open, or null when `tab` switches the Manufacturing intelligence tab instead. */
  href: string | null;
  tab?: MfgTabId;
}

/** A link the daily job stored (`payload.recommendation.screen`): Control Tower links switch the tab in place. */
export function screenFromHref(href: string, label: string | null | undefined): ScreenLink | null {
  if (!href.startsWith("/app/")) return null;
  const text = label ? `Open ${label}` : "Open screen";
  const [path = "", search = ""] = href.split("?");
  if (path === "/app/control-tower" || path === "/app/operations/control-tower") {
    const tab = parseTabParam(new URLSearchParams(search).get("tab"));
    return tab ? { label: text, href: null, tab } : null;
  }
  return { label: text, href };
}

/** Where a planner acts on a finding. Accepting a recommendation never does this by itself. */
export function screenForFinding(r: Pick<Recommendation, "kind" | "order_id"> & { payload?: Record<string, unknown> }, integratedOn: boolean): ScreenLink {
  const recObj = r.payload?.recommendation;
  const screen = recObj && typeof recObj === "object" ? (recObj as Record<string, unknown>).screen : null;
  if (screen && typeof screen === "object") {
    const s = screen as Record<string, unknown>;
    const stored = typeof s.href === "string" ? screenFromHref(s.href, typeof s.label === "string" ? s.label : null) : null;
    if (stored) return stored;
  }
  switch ((r.kind ?? "").toUpperCase()) {
    case "DELIVERY_RISK":
      if (integratedOn) return { label: "Open Plan changes", href: null, tab: "plan" };
      return r.order_id != null ? { label: "Open the order", href: `/app/orders/${r.order_id}` } : { label: "Open Line plan board", href: "/app/production/line-plan" };
    case "LATE_MATERIAL":
      return { label: "Open Purchase orders", href: "/app/inventory/purchase-orders" };
    case "CAPACITY_OVERLOAD":
    case "LINE_IDLE":
      return integratedOn ? { label: "Open Plan changes", href: null, tab: "plan" } : { label: "Open Line plan board", href: "/app/production/line-plan" };
    default:
      return { label: "Open Hourly production", href: "/app/production/hourly/sewing" };
  }
}

// ------------------------------------------------------------------ finding payload (shape written by the daily job)

export interface PayloadRow {
  label: string;
  value: string;
}

export interface FindingDetails {
  summary: string | null;
  recommendation: string | null;
  facts: PayloadRow[];
  /** Key dates (ex-factory target, P50 / P80 / P90, affected days), already formatted. */
  dates: PayloadRow[];
  assumptions: string[];
  alternatives: string[];
  approval: string | null;
  confidence: string | null;
  reasonCodes: string[];
  other: PayloadRow[];
}

const CONSUMED = new Set([
  "kind",
  "kind_label",
  "subject",
  "dates",
  "affected_dates",
  "days_affected",
  "orders_affected",
  "band",
  "spread_mode",
  "summary",
  "impact_summary",
  "title",
  "recommendation",
  "recommended_action",
  "facts",
  "evidence",
  "assumptions",
  "alternatives",
  "approval",
  "approval_required",
  "approval_requirement",
  "needs_approval",
  "confidence",
  "reason_codes",
  "href",
]);

function scalarText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    const parts = v.map(scalarText).filter((x): x is string => x != null);
    return parts.length === v.length && parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

function textOf(v: unknown): string | null {
  const s = scalarText(v);
  if (s != null) return s;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "summary", "action", "label", "description", "title"]) {
      const t = scalarText(o[k]);
      if (t) return t;
    }
  }
  return null;
}

function textList(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(textOf).filter((x): x is string => x != null);
}

function rowsOf(v: unknown): PayloadRow[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    const out: PayloadRow[] = [];
    for (const item of v) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const label = scalarText(o.label ?? o.name ?? o.key ?? o.metric);
        const value = scalarText(o.value ?? o.text);
        const unit = scalarText(o.unit);
        if (label && value) out.push({ label: humanizeCode(label), value: withUnit(value, unit) });
        else if (value) out.push({ label: "Fact", value });
      } else {
        const t = scalarText(item);
        if (t) out.push({ label: "Fact", value: t });
      }
    }
    return out;
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => ({ label: humanizeCode(k), value: scalarText(val) }))
      .filter((r): r is PayloadRow => r.value != null);
  }
  const t = scalarText(v);
  return t ? [{ label: "Fact", value: t }] : [];
}

/** Fact units written by the daily job: percent / days / count (decimal text). */
function withUnit(value: string, unit: string | null): string {
  if (!unit) return value;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return `${value} ${unit}`;
  switch (unit.toLowerCase()) {
    case "percent":
      return `${formatDecimal(value, 1)}%`;
    case "days":
      return `${formatDecimal(value, 1)} days`;
    case "count":
      return formatDecimal(value);
    default:
      return `${formatDecimal(value, 2)} ${unit}`;
  }
}

const DATE_LABEL: Record<string, string> = {
  target_date: "Ex-factory target",
  p50_date: "Likely finish (P50)",
  p80_date: "Safe date (P80)",
  p90_date: "Worst case (P90)",
  start_date: "Start",
  need_date: "Material needed by",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function datesOf(p: Record<string, unknown>): PayloadRow[] {
  const out: PayloadRow[] = [];
  const d = p.dates;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (typeof v === "string" && ISO_DATE.test(v)) out.push({ label: DATE_LABEL[k] ?? humanizeCode(k), value: formatDate(v) });
    }
  }
  if (Array.isArray(p.affected_dates)) {
    const days = p.affected_dates.filter((x): x is string => typeof x === "string" && ISO_DATE.test(x));
    if (days.length) {
      const shown = days.slice(0, 10).map(formatDate).join(", ");
      out.push({ label: "Affected days", value: days.length > 10 ? `${shown} … (+${days.length - 10})` : shown });
    }
  }
  return out;
}

function impactOf(p: Record<string, unknown>): string | null {
  const days = typeof p.days_affected === "number" ? p.days_affected : null;
  const orders = typeof p.orders_affected === "number" ? p.orders_affected : null;
  const parts: string[] = [];
  if (days != null && days > 0) parts.push(`${days} day(s) affected`);
  if (orders != null && orders > 1) parts.push(`${orders} orders`);
  return parts.length ? parts.join(" · ") : null;
}

function approvalText(p: Record<string, unknown>): string | null {
  const direct = textOf(p.approval_requirement ?? p.approval);
  if (direct) return direct;
  const flag = p.approval_required ?? p.needs_approval;
  if (typeof flag === "boolean") return flag ? "Yes - the change goes through the normal approval on its own screen." : "No extra approval named.";
  return null;
}

/** Reads the stored finding payload defensively: known keys go to their own section, other plain values to "other". */
export function findingDetails(payload: Record<string, unknown> | null | undefined): FindingDetails {
  const p = payload ?? {};
  const other: PayloadRow[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (CONSUMED.has(k)) continue;
    const t = scalarText(v);
    if (t != null) other.push({ label: humanizeCode(k), value: t });
  }
  return {
    summary: textOf(p.impact_summary ?? p.summary ?? p.title) ?? impactOf(p),
    recommendation: textOf(p.recommendation ?? p.recommended_action),
    facts: rowsOf(p.facts ?? p.evidence),
    dates: datesOf(p),
    assumptions: textList(p.assumptions),
    alternatives: textList(p.alternatives),
    approval: approvalText(p),
    confidence: scalarText(p.confidence),
    reasonCodes: Array.isArray(p.reason_codes) ? p.reason_codes.filter((c): c is string => typeof c === "string") : [],
    other,
  };
}

/** Departments are stored as plain names ("Production Planning"); codes are made readable. */
export function departmentLabel(dep: string | null | undefined): string {
  if (!dep) return "—";
  return /^[A-Z0-9_]+$/.test(dep) ? humanizeCode(dep) : dep;
}
