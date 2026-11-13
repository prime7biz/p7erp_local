import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/core";

import { approveErrorMessage, visibleTabs, NO_PHASE2 } from "../phase2/phase2Logic";
import { parseTabParam } from "../phase4/phase4Logic";
import {
  DEFAULT_SCENARIO_DRAFT,
  advancedErrorText,
  bucketLoad,
  convertErrorText,
  convertNoteError,
  displayLayers,
  draftToParams,
  forwardViews,
  isProposalStale,
  isValidRequestId,
  kpiRows,
  loadScenarioDraft,
  newSchedulerRequestId,
  noticeText,
  readPhase5Flags,
  saveScenarioDraft,
  scenarioDraftErrors,
  scenarioStorageKey,
  subtractDecimals,
  sumDecimals,
  toggleCompare,
  toggleExclude,
  type ScenarioDraft,
} from "./phase5Logic";

describe("phase 5 flags and tabs", () => {
  it("reads the flags strictly (=== true) and needs manufacturing intelligence", () => {
    expect(readPhase5Flags({ manufacturing_intelligence_v1: true, mfg_advanced_planning_v1: true })).toEqual({
      advanced: true,
      scheduler: false,
      finance: false,
    });
    expect(readPhase5Flags({ manufacturing_intelligence_v1: true, mfg_advanced_planning_v1: "true" }).advanced).toBe(false);
    expect(readPhase5Flags({ mfg_advanced_planning_v1: true }).advanced).toBe(false);
    expect(readPhase5Flags(null).advanced).toBe(false);
    const all = readPhase5Flags({
      manufacturing_intelligence_v1: true,
      mfg_advanced_planning_v1: true,
      mfg_integrated_planning_v1: true,
      mfg_financial_readiness_v1: true,
    });
    expect(all).toEqual({ advanced: true, scheduler: true, finance: true });
    // sub-flags never switch the tab on by themselves
    expect(readPhase5Flags({ manufacturing_intelligence_v1: true, mfg_integrated_planning_v1: true, mfg_financial_readiness_v1: true })).toEqual({
      advanced: false,
      scheduler: false,
      finance: false,
    });
  });

  it("adds the Forward plan tab only with the flag", () => {
    expect(visibleTabs(NO_PHASE2).map((t) => t.id)).not.toContain("forward");
    expect(visibleTabs(NO_PHASE2, { forward: true }).map((t) => t)).toContainEqual({ id: "forward", label: "Forward plan" });
  });

  it("parses the forward tab id and its alias", () => {
    expect(parseTabParam("forward")).toBe("forward");
    expect(parseTabParam("forward-plan")).toBe("forward");
    expect(parseTabParam("Forward-Plan")).toBe("forward");
    expect(parseTabParam("forwardplan")).toBeNull();
  });

  it("shows the finance view only with the flag AND can_view_finance", () => {
    const flags = { advanced: true, scheduler: true, finance: true };
    expect(forwardViews(flags, true).map((v) => v.id)).toEqual(["capacity", "scenarios", "finance", "scheduler"]);
    expect(forwardViews(flags, false).map((v) => v.id)).toEqual(["capacity", "scenarios", "scheduler"]);
    expect(forwardViews(flags, undefined).map((v) => v.id)).not.toContain("finance");
    expect(forwardViews({ ...flags, finance: false }, true).map((v) => v.id)).not.toContain("finance");
    expect(forwardViews({ advanced: false, scheduler: true, finance: true }, true)).toEqual([]);
  });
});

describe("tentative layers are alternative views", () => {
  const base = ["CONFIRMED_PLANNED_FIRM", "CONFIRMED_UNPLANNED", "TENTATIVE_WEIGHTED"];

  it("never returns both tentative layers", () => {
    for (const view of ["TENTATIVE_WEIGHTED", "TENTATIVE_FULL", null] as const) {
      const shown = displayLayers([...base, "TENTATIVE_FULL"], view);
      expect(shown.filter((l) => l.startsWith("TENTATIVE_")).length).toBeLessThanOrEqual(1);
    }
    expect(displayLayers(base, "TENTATIVE_FULL")).toEqual(["CONFIRMED_PLANNED_FIRM", "CONFIRMED_UNPLANNED", "TENTATIVE_FULL"]);
    expect(displayLayers(base, null)).toEqual(["CONFIRMED_PLANNED_FIRM", "CONFIRMED_UNPLANNED", "TENTATIVE_WEIGHTED"]);
  });

  it("keeps a finite result as the server admitted it", () => {
    expect(displayLayers(base, "TENTATIVE_FULL", true)).toEqual(["CONFIRMED_PLANNED_FIRM", "CONFIRMED_UNPLANNED", "TENTATIVE_WEIGHTED"]);
  });

  it("adds no tentative layer to a scenario without one", () => {
    expect(displayLayers(["CONFIRMED_PLANNED_FIRM"], "TENTATIVE_FULL")).toEqual(["CONFIRMED_PLANNED_FIRM"]);
  });

  it("sums only the shown layers, exactly", () => {
    const layers = { CONFIRMED_PLANNED_FIRM: "100.10", CONFIRMED_UNPLANNED: "0.20", TENTATIVE_WEIGHTED: "40.00", TENTATIVE_FULL: "80.00" };
    expect(bucketLoad(layers, displayLayers(base, "TENTATIVE_WEIGHTED"))).toBe("140.30");
    expect(bucketLoad(layers, displayLayers(base, "TENTATIVE_FULL"))).toBe("180.30");
  });
});

describe("decimal text maths (minutes only)", () => {
  it("adds and subtracts without float errors", () => {
    expect(sumDecimals(["0.10", "0.20"])).toBe("0.30");
    expect(sumDecimals(["1", "-2.5"])).toBe("-1.50");
    expect(sumDecimals(["1", null])).toBeNull();
    expect(subtractDecimals("100.00", "140.30")).toBe("-40.30");
    expect(subtractDecimals(null, "1")).toBeNull();
  });
});

describe("scenario parameters", () => {
  const d = (over: Partial<ScenarioDraft>): ScenarioDraft => ({ ...DEFAULT_SCENARIO_DRAFT, ...over });

  it("accepts the defaults and sends nothing extra", () => {
    expect(scenarioDraftErrors(DEFAULT_SCENARIO_DRAFT)).toEqual([]);
    expect(draftToParams(DEFAULT_SCENARIO_DRAFT)).toEqual({});
  });

  it("checks the backend ranges", () => {
    expect(scenarioDraftErrors(d({ overtime_pct: "25" }))).toEqual([]);
    expect(scenarioDraftErrors(d({ overtime_pct: "25.01" })).length).toBe(1);
    expect(scenarioDraftErrors(d({ overtime_pct: "-1" })).length).toBe(1);
    expect(scenarioDraftErrors(d({ extra_operator_pct: "-30" }))).toEqual([]);
    expect(scenarioDraftErrors(d({ extra_operator_pct: "-31" })).length).toBe(1);
    expect(scenarioDraftErrors(d({ virtual_lines: "6" })).length).toBe(1);
    expect(scenarioDraftErrors(d({ virtual_lines: "1.5" })).length).toBe(1);
    expect(scenarioDraftErrors(d({ overtime_pct: "abc" })).length).toBe(1);
  });

  it("allows absence only with planned efficiency", () => {
    expect(scenarioDraftErrors(d({ absence_pct: "5" }))[0]).toMatch(/only with Planned efficiency/);
    expect(scenarioDraftErrors(d({ absence_pct: "5", efficiency_basis: "PLAN" }))).toEqual([]);
    expect(scenarioDraftErrors(d({ absence_pct: "31", efficiency_basis: "PLAN" })).length).toBe(1);
  });

  it("builds query parameters from a valid draft", () => {
    expect(draftToParams(d({ efficiency_basis: "PLAN", absence_pct: "5", overtime_pct: "10", virtual_lines: "2" }))).toEqual({
      efficiency_basis: "PLAN",
      absence_pct: "5",
      overtime_pct: "10",
      virtual_lines: 2,
    });
  });

  it("compares at most 4 scenarios", () => {
    let list = toggleCompare([], "BASE");
    list = toggleCompare(list, "OPTIMISTIC");
    list = toggleCompare(list, "CONSERVATIVE");
    list = toggleCompare(list, "CAPACITY_CONSTRAINED");
    expect(list.length).toBe(4);
    expect(toggleCompare(list, "BASE")).toEqual(["OPTIMISTIC", "CONSERVATIVE", "CAPACITY_CONSTRAINED"]);
    expect(scenarioDraftErrors(d({ compare: ["BASE", "OPTIMISTIC", "CONSERVATIVE", "CAPACITY_CONSTRAINED", "BASE"] })).length).toBe(1);
  });

  it("saves and loads parameters per tenant and user", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const key = scenarioStorageKey(7, 42);
    expect(key).toBe("p7_mfg_scenario:7:42");
    const draft = d({ scenario: "CONSERVATIVE", overtime_pct: "10", compare: ["BASE"] });
    expect(saveScenarioDraft(storage, key, draft)).toBe(true);
    expect(loadScenarioDraft(storage, key)).toEqual(draft);
    expect(loadScenarioDraft(storage, scenarioStorageKey(7, 43))).toEqual(DEFAULT_SCENARIO_DRAFT);
    store.set(key, "{broken");
    expect(loadScenarioDraft(storage, key)).toEqual(DEFAULT_SCENARIO_DRAFT);
    store.set(key, JSON.stringify({ ...draft, overtime_pct: "99" }));
    expect(loadScenarioDraft(storage, key)).toEqual(DEFAULT_SCENARIO_DRAFT);
    expect(loadScenarioDraft(null, key)).toEqual(DEFAULT_SCENARIO_DRAFT);
  });
});

describe("scheduler helpers", () => {
  it("toggles excluded jobs, max 100, valid ids only", () => {
    expect(toggleExclude([], "row:5")).toEqual(["row:5"]);
    expect(toggleExclude(["row:5"], "row:5")).toEqual([]);
    expect(toggleExclude([], "bad")).toEqual([]);
    const full = Array.from({ length: 100 }, (_, i) => `order:${i + 1}`);
    expect(toggleExclude(full, "row:1")).toHaveLength(100);
  });

  it("makes request ids the backend accepts", () => {
    const a = newSchedulerRequestId();
    const b = newSchedulerRequestId();
    expect(isValidRequestId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isValidRequestId("short")).toBe(false);
    expect(isValidRequestId("a".repeat(33))).toBe(false);
    expect(isValidRequestId("has space 123")).toBe(false);
  });

  it("needs a 5-500 character note", () => {
    expect(convertNoteError("abc")).toMatch(/at least 5/);
    expect(convertNoteError("   abcd  ")).toMatch(/at least 5/);
    expect(convertNoteError("abcde")).toBe("");
    expect(convertNoteError("x".repeat(501))).toMatch(/at most 500/);
  });

  it("explains error codes in plain words", () => {
    expect(advancedErrorText(new ApiError("x", 422, null, "TOO_MANY_LINES"), "Forward plan")).toMatch(/factory unit/);
    expect(advancedErrorText(new ApiError("x", 503, null, "FORWARD_PLAN_TIMEOUT"), "Forward plan")).toMatch(/shorter horizon/);
    expect(advancedErrorText(new ApiError("x", 422, null, "ABSENCE_ALREADY_IN_EMPIRICAL"), "Forward plan")).toMatch(/Planned efficiency/);
    expect(advancedErrorText(new ApiError("Not found", 404), "Forward plan")).toMatch(/switched off/);
    const stale = new ApiError("changed", 409, null, "PROPOSAL_STALE");
    expect(isProposalStale(stale)).toBe(true);
    expect(isProposalStale(new ApiError("x", 409, null, "REQUEST_ID_REUSED"))).toBe(false);
    expect(convertErrorText(stale)).toMatch(/run again/);
    expect(convertErrorText(new ApiError("x", 422, null, "FROZEN_ZONE"))).toMatch(/frozen zone/);
    expect(convertErrorText(new ApiError("x", 422, null, "NOTHING_TO_CONVERT"))).toMatch(/no changes/);
  });

  it("shows the frozen-zone approve conflict as a plain message", () => {
    const e = new ApiError("PROPOSAL_ENTERED_FROZEN_ZONE: a scheduler booking now starts on or before the frozen-zone end (2026-11-27).", 409);
    expect(approveErrorMessage(e)).toMatch(/inside the frozen zone, so nothing was applied/);
    expect(approveErrorMessage(e)).not.toContain("PROPOSAL_ENTERED_FROZEN_ZONE");
    expect(approveErrorMessage(new ApiError("Line plan changed since", 409))).toMatch(/changed since you opened it/);
  });

  it("builds KPI rows (lower is better)", () => {
    const rows = kpiRows(
      { late_jobs: 3, lateness_days: 10, changeovers: 2, overtime_minutes: "0.00", unscheduled_jobs: 1 },
      { late_jobs: 1, lateness_days: 12, changeovers: 2, overtime_minutes: "0.00", unscheduled_jobs: 0 },
    );
    expect(rows.find((r) => r.key === "late_jobs")?.trend).toBe("better");
    expect(rows.find((r) => r.key === "lateness_days")?.trend).toBe("worse");
    expect(rows.find((r) => r.key === "changeovers")?.trend).toBe("same");
    expect(kpiRows(undefined, undefined)).toEqual([]);
  });

  it("shows the plain text of coded notices", () => {
    expect(noticeText("UNPLANNED_NOT_ATTRIBUTED_TO_UNIT: unplanned confirmed quantity is scheduled only without a factory unit")).toBe(
      "Unplanned confirmed quantity is scheduled only without a factory unit",
    );
    expect(noticeText("Plain notice")).toBe("Plain notice");
  });
});
