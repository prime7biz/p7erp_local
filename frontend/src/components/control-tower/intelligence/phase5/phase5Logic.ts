/**
 * Pure helpers for the Manufacturing Intelligence Phase 5 "Forward plan" tab (no React, no fetch).
 * Minutes and money stay decimal STRINGS from the backend. The only sum done here is of minutes (exact, on scaled
 * integers) when the planner switches the tentative view; money is never calculated, only formatted.
 */
import type {
  DemandLayer,
  EfficiencyBasis,
  ForwardPlanParams,
  ForwardScenario,
  SchedulerJob,
  SchedulerKpi,
} from "@/api/mfgAdvancedPlanning";

import { formatDate, formatDecimal } from "../formatDecimal";
import type { ChipTone } from "../panelLogic";
import { errorCode, errorStatus } from "../phase2/phase2Logic";
import { humanizeCode } from "../reasonLabels";

// ------------------------------------------------------------------ flags

export interface MfgPhase5Flags {
  /** mfg_advanced_planning_v1 (with manufacturing_intelligence_v1): the Forward plan tab */
  advanced: boolean;
  /** + mfg_integrated_planning_v1: the Scheduler sub-view */
  scheduler: boolean;
  /** + mfg_financial_readiness_v1: the Finance sub-view (also needs the can_view_finance hint) */
  finance: boolean;
}

export const NO_PHASE5: MfgPhase5Flags = { advanced: false, scheduler: false, finance: false };

/** Strict `=== true` like the backend: a missing flag or any other value is OFF. */
export function readPhase5Flags(flags: Record<string, unknown> | null | undefined): MfgPhase5Flags {
  const f = flags ?? {};
  const advanced = f.manufacturing_intelligence_v1 === true && f.mfg_advanced_planning_v1 === true;
  return {
    advanced,
    scheduler: advanced && f.mfg_integrated_planning_v1 === true,
    finance: advanced && f.mfg_financial_readiness_v1 === true,
  };
}

export type ForwardView = "capacity" | "scenarios" | "finance" | "scheduler";

/** Sub-views of the Forward plan tab. Finance needs the flag AND the can_view_finance hint (the backend still checks). */
export function forwardViews(flags: MfgPhase5Flags, canViewFinance: boolean | null | undefined): { id: ForwardView; label: string }[] {
  if (!flags.advanced) return [];
  const views: { id: ForwardView; label: string }[] = [
    { id: "capacity", label: "Capacity vs demand" },
    { id: "scenarios", label: "Scenarios" },
  ];
  if (flags.finance && canViewFinance === true) views.push({ id: "finance", label: "Finance" });
  if (flags.scheduler) views.push({ id: "scheduler", label: "Scheduler" });
  return views;
}

// ------------------------------------------------------------------ horizons, scenarios, bases

export const HORIZONS = [90, 120, 150, 180] as const;
export const DEFAULT_HORIZON = 90;

export const SCENARIOS: ForwardScenario[] = ["BASE", "OPTIMISTIC", "CONSERVATIVE", "CAPACITY_CONSTRAINED"];
export const MAX_COMPARE = 4;

export const SCENARIO_LABEL: Record<string, string> = {
  BASE: "Base (most likely)",
  OPTIMISTIC: "Optimistic",
  CONSERVATIVE: "Conservative",
  CAPACITY_CONSTRAINED: "Capacity-limited",
  FINANCE_CONSTRAINED: "Finance-limited",
};

export const SCENARIO_HELP: Record<string, string> = {
  BASE: "Confirmed and booked work plus tentative bookings weighted by their confidence; typical efficiency from history (P50).",
  OPTIMISTIC: "Same demand as Base, with the efficiency of good days (Q20).",
  CONSERVATIVE: "Confirmed and booked work, every tentative booking at full quantity and the demand forecast; cautious efficiency (P80).",
  CAPACITY_CONSTRAINED: "Base demand, but work above a week's capacity is carried to the next week (finite loading).",
};

export function scenarioLabel(s: string | null | undefined): string {
  const k = (s ?? "").toUpperCase();
  return SCENARIO_LABEL[k] ?? (k ? humanizeCode(k) : "—");
}

export const BASES: EfficiencyBasis[] = ["PLAN", "P50", "Q20", "P80", "P90"];

export const BASIS_LABEL: Record<string, string> = {
  PLAN: "Planned efficiency",
  P50: "Typical (P50, from history)",
  Q20: "Good days (Q20, from history)",
  P80: "Cautious (P80, from history)",
  P90: "Very cautious (P90, from history)",
};

export const EFFICIENCY_MODE_LABEL: Record<string, string> = {
  PLAN: "Planned efficiency",
  EMPIRICAL_SPREAD: "From history",
  FIXED_BANDS: "Fixed safety bands (not enough history)",
  MIXED: "Mixed (some lines with fixed bands)",
};

// ------------------------------------------------------------------ demand layers

/** Bottom-to-top stacking order. TENTATIVE_FULL and TENTATIVE_WEIGHTED are alternatives, never stacked together. */
export const LAYER_ORDER: DemandLayer[] = [
  "CONFIRMED_PLANNED_FIRM",
  "CONFIRMED_PLANNED_SOFT",
  "OVERDUE_PLANNED_BACKLOG",
  "UNCONFIRMED_ORDER_ROWS",
  "UNLINKED_ROWS",
  "CONFIRMED_UNPLANNED",
  "OVERDUE_UNPLANNED",
  "TENTATIVE_WEIGHTED",
  "TENTATIVE_FULL",
  "FORECAST_RESIDUAL",
];

export const TENTATIVE_LAYERS: DemandLayer[] = ["TENTATIVE_FULL", "TENTATIVE_WEIGHTED"];

export const LAYER_LABEL: Record<string, string> = {
  CONFIRMED_PLANNED_FIRM: "Confirmed - firm booked",
  CONFIRMED_PLANNED_SOFT: "Confirmed - soft booked",
  OVERDUE_PLANNED_BACKLOG: "Overdue booked work",
  UNCONFIRMED_ORDER_ROWS: "Unconfirmed orders (booked)",
  UNLINKED_ROWS: "Bookings without an order",
  CONFIRMED_UNPLANNED: "Confirmed - not yet booked",
  OVERDUE_UNPLANNED: "Overdue - not yet booked",
  TENTATIVE_WEIGHTED: "Tentative (weighted by confidence)",
  TENTATIVE_FULL: "Tentative (full quantity)",
  FORECAST_RESIDUAL: "Forecast (not yet ordered)",
};

/** Light-theme colours for the stacked bars and the legend. */
export const LAYER_COLOR: Record<string, string> = {
  CONFIRMED_PLANNED_FIRM: "bg-blue-700",
  CONFIRMED_PLANNED_SOFT: "bg-blue-400",
  OVERDUE_PLANNED_BACKLOG: "bg-red-500",
  UNCONFIRMED_ORDER_ROWS: "bg-slate-400",
  UNLINKED_ROWS: "bg-slate-300",
  CONFIRMED_UNPLANNED: "bg-teal-500",
  OVERDUE_UNPLANNED: "bg-orange-500",
  TENTATIVE_WEIGHTED: "bg-amber-300",
  TENTATIVE_FULL: "bg-amber-500",
  FORECAST_RESIDUAL: "bg-purple-300",
};

export function layerLabel(layer: string): string {
  return LAYER_LABEL[layer] ?? humanizeCode(layer);
}

export type TentativeView = "TENTATIVE_WEIGHTED" | "TENTATIVE_FULL";

/** The tentative view the scenario itself uses (null when the scenario has no tentative layer). */
export function scenarioTentativeView(layersIncluded: readonly string[]): TentativeView | null {
  if (layersIncluded.includes("TENTATIVE_FULL")) return "TENTATIVE_FULL";
  if (layersIncluded.includes("TENTATIVE_WEIGHTED")) return "TENTATIVE_WEIGHTED";
  return null;
}

/**
 * Layers to stack, in LAYER_ORDER. Both tentative layers are removed and at most ONE is added back (the chosen view),
 * so full and weighted tentative demand are never summed. A finite (capacity-limited) result is shown exactly as the
 * server admitted it.
 */
export function displayLayers(layersIncluded: readonly string[], view: TentativeView | null, finite = false): string[] {
  const included = new Set(layersIncluded);
  const own = scenarioTentativeView(layersIncluded);
  const chosen: TentativeView | null = finite ? own : own ? (view ?? own) : null;
  return LAYER_ORDER.filter((l) => {
    if (l === "TENTATIVE_FULL" || l === "TENTATIVE_WEIGHTED") return l === chosen;
    return included.has(l);
  });
}

// ------------------------------------------------------------------ exact minute sums (scaled integers)

const SCALE = 4;
const DEC_RE = /^-?\d+(\.\d+)?$/;

function toScaled(v: string | null | undefined): bigint | null {
  if (v == null) return null;
  const s = v.trim();
  if (!DEC_RE.test(s)) return null;
  const neg = s.startsWith("-");
  const [i = "0", f = ""] = (neg ? s.slice(1) : s).split(".");
  const frac = (f + "0".repeat(SCALE)).slice(0, SCALE);
  const n = BigInt(i) * 10n ** BigInt(SCALE) + BigInt(frac || "0");
  return neg ? -n : n;
}

function fromScaled(n: bigint, decimals = 2): string {
  const neg = n < 0n;
  let a = neg ? -n : n;
  const drop = SCALE - decimals;
  if (drop > 0) {
    const div = 10n ** BigInt(drop);
    const rem = a % div;
    a = a / div + (rem * 2n >= div ? 1n : 0n);
  }
  const base = 10n ** BigInt(decimals);
  const whole = a / base;
  const frac = (a % base).toString().padStart(decimals, "0");
  const body = decimals > 0 ? `${whole}.${frac}` : `${whole}`;
  return neg && a !== 0n ? `-${body}` : body;
}

/** Exact sum of decimal strings (2 decimals out). Null when any value is missing or not a number. */
export function sumDecimals(values: readonly (string | null | undefined)[], decimals = 2): string | null {
  let total = 0n;
  for (const v of values) {
    const n = toScaled(v);
    if (n == null) return null;
    total += n;
  }
  return fromScaled(total, decimals);
}

/** a - b as text (null if either is missing). */
export function subtractDecimals(a: string | null | undefined, b: string | null | undefined, decimals = 2): string | null {
  const x = toScaled(a);
  const y = toScaled(b);
  if (x == null || y == null) return null;
  return fromScaled(x - y, decimals);
}

/** Load of a bucket for the shown layers (exact). */
export function bucketLoad(layers: Record<string, string | null>, shown: readonly string[]): string | null {
  return sumDecimals(shown.map((l) => layers[l] ?? "0"));
}

/** Width of a value as a share of `max` in percent (display only). */
export function shareOf(value: string | null | undefined, max: number): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0 || max <= 0) return 0;
  return Math.min(100, (n / max) * 100);
}

export function formatMinutes(v: string | null | undefined): string {
  const s = formatDecimal(v, 0);
  return s === "—" ? s : `${s} min`;
}

/** "1,234.5678" style for 4-dp money strings, display only. */
export function formatMoney(v: string | null | undefined): string {
  return formatDecimal(v, 2);
}

export function bucketLabel(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

/** Notices may be "CODE: plain text"; show the plain text (or the readable code). */
export function noticeText(raw: string): string {
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/.exec(raw.trim());
  if (!m) return raw;
  return m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : humanizeCode(m[1] ?? raw);
}

// ------------------------------------------------------------------ scenario parameters

export interface ScenarioDraft {
  scenario: ForwardScenario;
  /** "" = the preset's own basis */
  efficiency_basis: "" | EfficiencyBasis;
  overtime_pct: string;
  absence_pct: string;
  extra_operator_pct: string;
  virtual_lines: string;
  /** Scenarios ticked for Compare (at most 4). */
  compare: ForwardScenario[];
}

export const DEFAULT_SCENARIO_DRAFT: ScenarioDraft = {
  scenario: "BASE",
  efficiency_basis: "",
  overtime_pct: "0",
  absence_pct: "0",
  extra_operator_pct: "0",
  virtual_lines: "0",
  compare: ["BASE", "CONSERVATIVE"],
};

export const PARAM_LIMITS = {
  overtime_pct: { min: 0, max: 25, label: "Overtime %" },
  absence_pct: { min: 0, max: 30, label: "Absence %" },
  extra_operator_pct: { min: -30, max: 30, label: "Extra operators %" },
} as const;
export const MAX_VIRTUAL_LINES = 5;

const PCT_RE = /^-?\d{1,3}(\.\d{1,2})?$/;

function pctError(key: keyof typeof PARAM_LIMITS, raw: string): string {
  const { min, max, label } = PARAM_LIMITS[key];
  const s = raw.trim() || "0";
  if (!PCT_RE.test(s) || (min >= 0 && s.startsWith("-"))) return `${label} must be a number from ${min} to ${max} (up to 2 decimals).`;
  const n = Number(s);
  if (n < min || n > max) return `${label} must be from ${min} to ${max}.`;
  return "";
}

function isZeroText(raw: string): boolean {
  const s = raw.trim();
  return s === "" || /^-?0+(\.0+)?$/.test(s);
}

/** Basis actually used: the explicit choice, else the preset's own one. */
export function effectiveBasis(d: Pick<ScenarioDraft, "scenario" | "efficiency_basis">): EfficiencyBasis {
  if (d.efficiency_basis) return d.efficiency_basis;
  return d.scenario === "OPTIMISTIC" ? "Q20" : d.scenario === "CONSERVATIVE" ? "P80" : "P50";
}

/** Same checks as the backend (PARAMETER_OUT_OF_RANGE, ABSENCE_ALREADY_IN_EMPIRICAL, TOO_MANY_SCENARIOS). */
export function scenarioDraftErrors(d: ScenarioDraft): string[] {
  const errs: string[] = [];
  for (const k of ["overtime_pct", "absence_pct", "extra_operator_pct"] as const) {
    const e = pctError(k, d[k]);
    if (e) errs.push(e);
  }
  const vl = d.virtual_lines.trim() || "0";
  if (!/^\d+$/.test(vl) || Number(vl) > MAX_VIRTUAL_LINES) errs.push(`Extra (virtual) lines must be a whole number from 0 to ${MAX_VIRTUAL_LINES}.`);
  if (!pctError("absence_pct", d.absence_pct) && !isZeroText(d.absence_pct) && effectiveBasis(d) !== "PLAN")
    errs.push("Absence % can be used only with Planned efficiency: efficiency from history already includes absence.");
  if (d.compare.length > MAX_COMPARE) errs.push(`Compare at most ${MAX_COMPARE} scenarios.`);
  return errs;
}

/** Query parameters for a valid draft (zero / empty values are left out so the preset applies). */
export function draftToParams(d: ScenarioDraft): ForwardPlanParams {
  const p: ForwardPlanParams = {};
  if (d.efficiency_basis) p.efficiency_basis = d.efficiency_basis;
  if (!isZeroText(d.overtime_pct)) p.overtime_pct = d.overtime_pct.trim();
  if (!isZeroText(d.absence_pct)) p.absence_pct = d.absence_pct.trim();
  if (!isZeroText(d.extra_operator_pct)) p.extra_operator_pct = d.extra_operator_pct.trim();
  const vl = Number(d.virtual_lines.trim() || "0");
  if (vl > 0) p.virtual_lines = vl;
  return p;
}

export function toggleCompare(list: readonly ForwardScenario[], s: ForwardScenario): ForwardScenario[] {
  if (list.includes(s)) return list.filter((x) => x !== s);
  if (list.length >= MAX_COMPARE) return [...list];
  return SCENARIOS.filter((x) => x === s || list.includes(x));
}

// ------------------------------------------------------------------ browser storage of saved parameters

export function scenarioStorageKey(tenantId: number | string, userId: number | string): string {
  return `p7_mfg_scenario:${tenantId}:${userId}`;
}

function asScenario(v: unknown): ForwardScenario | null {
  return typeof v === "string" && (SCENARIOS as string[]).includes(v) ? (v as ForwardScenario) : null;
}

/** Reads saved parameters defensively; anything broken falls back to the defaults. */
export function loadScenarioDraft(storage: Pick<Storage, "getItem"> | null | undefined, key: string | null): ScenarioDraft {
  if (!storage || !key) return { ...DEFAULT_SCENARIO_DRAFT };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { ...DEFAULT_SCENARIO_DRAFT };
    const o = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown, dflt: string) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : dflt);
    const basis = typeof o.efficiency_basis === "string" && (BASES as string[]).includes(o.efficiency_basis) ? (o.efficiency_basis as EfficiencyBasis) : "";
    const compare = Array.isArray(o.compare) ? o.compare.map(asScenario).filter((x): x is ForwardScenario => x != null) : DEFAULT_SCENARIO_DRAFT.compare;
    const draft: ScenarioDraft = {
      scenario: asScenario(o.scenario) ?? "BASE",
      efficiency_basis: basis,
      overtime_pct: str(o.overtime_pct, "0"),
      absence_pct: str(o.absence_pct, "0"),
      extra_operator_pct: str(o.extra_operator_pct, "0"),
      virtual_lines: str(o.virtual_lines, "0"),
      compare: Array.from(new Set(compare)).slice(0, MAX_COMPARE),
    };
    return scenarioDraftErrors(draft).length ? { ...DEFAULT_SCENARIO_DRAFT } : draft;
  } catch {
    return { ...DEFAULT_SCENARIO_DRAFT };
  }
}

export function saveScenarioDraft(storage: Pick<Storage, "setItem"> | null | undefined, key: string | null, d: ScenarioDraft): boolean {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ errors

function serverMessage(e: unknown): string {
  return e instanceof Error && e.message && e.message !== "Request failed" ? e.message : "";
}

/** Message for a failed forward-plan / scheduler GET. */
export function advancedErrorText(e: unknown, what: string): string {
  const status = errorStatus(e);
  const code = errorCode(e);
  const msg = serverMessage(e);
  switch (code) {
    case "TOO_MANY_LINES":
      return "Too many sewing lines to calculate at once. Type a factory unit and try again.";
    case "FORWARD_PLAN_TIMEOUT":
    case "SCHEDULER_TIMEOUT":
      return "This took too long. Try again, choose a factory unit or a shorter horizon.";
    case "HORIZON_NOT_ALLOWED":
      return "Choose a horizon of 90, 120, 150 or 180 days.";
    case "ABSENCE_ALREADY_IN_EMPIRICAL":
      return "Absence % can be used only with Planned efficiency: efficiency from history already includes absence.";
    case "TOO_MANY_SCENARIOS":
      return `Compare at most ${MAX_COMPARE} scenarios.`;
    case "PARAMETER_OUT_OF_RANGE":
      return `A scenario value is out of range${msg ? `: ${msg}` : "."}`;
    default:
      break;
  }
  if (status === 404) return `${what}: the forward plan is switched off for your company. An admin can turn it on in Settings → Configuration.`;
  if (status === 403) return `${what}: you do not have access${msg ? ` (${msg})` : ""}.`;
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 503) return "The server is busy. Please try again in a moment.";
  if (status === 422) return msg ? `Please check the choices: ${msg}` : "Please check the choices.";
  return msg || `${what}: could not load. Please try again.`;
}

export function isProposalStale(e: unknown): boolean {
  return errorStatus(e) === 409 && errorCode(e) === "PROPOSAL_STALE";
}

/** Message for a failed "Create plan revision". */
export function convertErrorText(e: unknown): string {
  const code = errorCode(e);
  const status = errorStatus(e);
  const msg = serverMessage(e);
  switch (code) {
    case "PROPOSAL_STALE":
      return "The line plan changed since this preview. The preview was run again - please check the new proposal and try once more.";
    case "REQUEST_ID_REUSED":
      return "This request was already sent with a different note. Close the dialog and open it again.";
    case "FROZEN_ZONE":
      return "A proposed booking now starts inside the frozen zone. Run the preview again.";
    case "NOTHING_TO_CONVERT":
      return "The proposal has no changes, so there is nothing to send for approval.";
    case "TOO_MANY_LINES":
      return "Too many sewing lines. Choose a factory unit, run the preview again and retry.";
    case "SCHEDULER_TIMEOUT":
      return "This took too long. Try again or choose a factory unit.";
    default:
      break;
  }
  if (status === 403) return `You are not allowed to create plan revisions${msg ? ` (${msg})` : ""}. This needs the plan write permission.`;
  if (status === 404) return "The scheduler is switched off for your company.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return msg || "Could not create the plan revision. Please try again.";
}

// ------------------------------------------------------------------ convert dialog

export const NOTE_MIN = 5;
export const NOTE_MAX = 500;
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

export function convertNoteError(note: string): string {
  const s = note.trim();
  if (s.length < NOTE_MIN) return `Please write a note of at least ${NOTE_MIN} characters (why the plan should change).`;
  if (s.length > NOTE_MAX) return `The note can be at most ${NOTE_MAX} characters (now ${s.length}).`;
  return "";
}

export function isValidRequestId(id: string): boolean {
  return REQUEST_ID_RE.test(id);
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 24-character id (letters and digits, matches ^[A-Za-z0-9_-]{8,32}$), made once per dialog. */
export function newSchedulerRequestId(): string {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  const bytes = new Uint8Array(22);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `p7${Array.from(bytes, (b) => ALNUM[b % ALNUM.length]).join("")}`;
}

// ------------------------------------------------------------------ scheduler jobs

export const MAX_EXCLUDE = 100;
export const JOB_ID_RE = /^(row|order):\d+$/;

/** Exclude / include a job; at most 100 excluded. Returns the same list when nothing can change. */
export function toggleExclude(list: readonly string[], jobId: string): string[] {
  if (!JOB_ID_RE.test(jobId)) return [...list];
  if (list.includes(jobId)) return list.filter((x) => x !== jobId);
  if (list.length >= MAX_EXCLUDE) return [...list];
  return [...list, jobId];
}

export const JOB_STATUS_LABEL: Record<string, string> = {
  PLACED: "Moved / placed",
  UNCHANGED: "Stays as it is",
  UNSCHEDULED: "Could not be placed",
  PINNED: "Excluded (kept where it is)",
};

export function jobStatusTone(status: string): ChipTone {
  switch (status) {
    case "PLACED":
      return "good";
    case "UNSCHEDULED":
      return "bad";
    case "PINNED":
      return "warn";
    default:
      return "neutral";
  }
}

export const ACTION_LABEL: Record<string, string> = {
  UPDATE: "Move booking",
  CREATE: "New soft booking",
};

export const CRITERION_LABEL: Record<string, string> = {
  LATENESS: "it finishes later",
  CHANGEOVER: "it needs a bigger style change",
  IDLE_GAP: "it leaves a longer idle gap on the line",
  OVERTIME: "it needs more overtime",
  LINE_CODE: "same score - line code order decides",
  LINE_ID: "same score - line order decides",
};

export const CHANGEOVER_LABEL: Record<number, string> = {
  0: "Same style as before (no changeover)",
  1: "Same style family",
  2: "Different style (changeover)",
  3: "Style family never run on this line",
};

export const JOB_REASON_LABEL: Record<string, string> = {
  OVERTIME_WOULD_RECOVER: "Overtime could recover the delay (information only)",
  FIRM_RESCHEDULE_SUGGESTED: "Firm booking will be late - consider moving it by hand",
  TENTATIVE_DISPLACED: "Overlaps a tentative booking (not blocking)",
  JOB_LIMIT: "Too many jobs - kept where it is",
  SMV_UNKNOWN: "SMV unknown - kept where it is",
  REVISION_ITEM_LIMIT: "Over 50 changes - kept where it is",
  PINNED_BY_USER: "Excluded by you",
  NO_CAPACITY_IN_HORIZON: "No free capacity in the horizon",
  MATERIAL_LIMITED: "Waits for material",
  FROZEN_LIMITED: "Waits for the end of the frozen zone",
  MATERIAL_DATE_UNKNOWN: "Material date unknown",
  NEW_FAMILY_FOR_LINE: "New style family for the line",
  STYLE_CHANGE: "Style change on the line",
  SAME_STYLE: "Same style",
  SAME_FAMILY: "Same family",
  ON_TIME: "On time",
  QTY_UNKNOWN: "Quantity unknown",
  PROPOSAL_ONLY: "Proposal only",
  SPLIT_NOT_EVALUATED: "Splitting over lines not tried",
  POST_SEWING_NOT_APPLIED: "Finishing days after sewing not added",
};

export function jobReasonLabel(code: string): string {
  return JOB_REASON_LABEL[code] ?? humanizeCode(code);
}

export function jobLabel(job: Pick<SchedulerJob, "order_code" | "order_id" | "kind" | "config_id">): string {
  const order = job.order_code ?? `Order #${job.order_id}`;
  return job.kind === "ROW" && job.config_id != null ? `${order} (booking #${job.config_id})` : `${order} (not booked yet)`;
}

/** Plain explanation of why the scheduler chose this line, and why each alternative lost. */
export function whyThisLine(job: SchedulerJob, lineCode: (id: number) => string): string[] {
  const out: string[] = [];
  const p = job.placement;
  if (!p) {
    if (job.status === "PINNED") out.push("You excluded this job, so it stays exactly where it is now.");
    else if (job.status === "UNSCHEDULED") out.push("No line had enough free capacity in the horizon, so nothing is proposed for it.");
    else out.push("The job keeps its current line and dates.");
    return out;
  }
  out.push(
    `Proposed on ${p.line_code} from ${formatDate(p.start_date)} to ${formatDate(p.end_date)} (${p.working_days} working day${p.working_days === 1 ? "" : "s"}).`,
  );
  out.push(p.lateness_days > 0 ? `It finishes ${p.lateness_days} day(s) after the ex-factory date.` : "It finishes by the ex-factory date.");
  out.push(CHANGEOVER_LABEL[p.changeover_rank] ?? `Changeover rank ${p.changeover_rank}.`);
  if (p.score.idle_gap_days > 0) out.push(`It leaves ${p.score.idle_gap_days} idle day(s) on the line before it starts.`);
  if (job.current) {
    out.push(`Now on ${lineCode(job.current.line_id)} from ${formatDate(job.current.start_date)}${job.current.end_date ? ` to ${formatDate(job.current.end_date)}` : ""}.`);
  }
  out.push("Lines are compared in this order: finish on time, smallest style change, shortest idle gap, least overtime, then line code.");
  return out;
}

export function alternativeText(a: { line_code: string; start_date: string; end_date: string; deciding_criterion: string }): string {
  const why = CRITERION_LABEL[a.deciding_criterion] ?? humanizeCode(a.deciding_criterion).toLowerCase();
  return `${a.line_code}, ${formatDate(a.start_date)} – ${formatDate(a.end_date)}: not chosen because ${why}.`;
}

export interface KpiRow {
  key: keyof SchedulerKpi;
  label: string;
  before: string;
  after: string;
  /** "better" | "worse" | "same" (lower is better for every KPI) */
  trend: "better" | "worse" | "same";
}

const KPI_LABELS: { key: keyof SchedulerKpi; label: string; minutes?: boolean }[] = [
  { key: "late_jobs", label: "Late jobs" },
  { key: "lateness_days", label: "Total days late" },
  { key: "changeovers", label: "Style changeovers" },
  { key: "unscheduled_jobs", label: "Jobs not placed" },
  { key: "overtime_minutes", label: "Overtime needed", minutes: true },
];

export function kpiRows(before: SchedulerKpi | undefined, after: SchedulerKpi | undefined): KpiRow[] {
  if (!before || !after) return [];
  return KPI_LABELS.map(({ key, label, minutes }) => {
    const b = Number(before[key]);
    const a = Number(after[key]);
    const trend: KpiRow["trend"] = a < b ? "better" : a > b ? "worse" : "same";
    const fmt = (v: number | string) => (minutes ? formatMinutes(String(v)) : formatDecimal(String(v)));
    return { key, label, before: fmt(before[key]), after: fmt(after[key]), trend };
  });
}
