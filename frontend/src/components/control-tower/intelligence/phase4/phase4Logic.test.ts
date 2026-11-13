import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/core";

import { visibleTabs, NO_PHASE2 } from "../phase2/phase2Logic";
import {
  actionError,
  anomalyValue,
  anomalyWindowError,
  canDecide,
  decisionNoteError,
  findingDetails,
  isAiWording,
  isFixedBands,
  NO_PHASE4,
  parseFindingParam,
  parseTabParam,
  probabilityText,
  readPhase4Flags,
  screenForFinding,
  toDecisionInput,
} from "./phase4Logic";

describe("phase 4 flags and tabs", () => {
  it("reads both flags strictly (=== true) and AI text only together with predictions", () => {
    expect(readPhase4Flags(undefined)).toEqual(NO_PHASE4);
    expect(readPhase4Flags({ mfg_predictive_intelligence_v1: "true", mfg_predictive_ai_text_v1: 1 })).toEqual(NO_PHASE4);
    expect(readPhase4Flags({ mfg_predictive_ai_text_v1: true })).toEqual(NO_PHASE4);
    expect(readPhase4Flags({ mfg_predictive_intelligence_v1: true })).toEqual({ predictions: true, aiText: false });
    expect(readPhase4Flags({ mfg_predictive_intelligence_v1: true, mfg_predictive_ai_text_v1: true })).toEqual({ predictions: true, aiText: true });
  });

  it("adds the Predictions tab only when asked", () => {
    expect(visibleTabs(NO_PHASE2).map((t) => t.id)).toEqual(["overview"]);
    expect(visibleTabs(NO_PHASE2, { predictions: true }).map((t) => t.id)).toEqual(["overview", "predictions"]);
  });

  it("parses deep-link params safely", () => {
    expect(parseTabParam("predictions")).toBe("predictions");
    expect(parseTabParam("PREDICTIONS")).toBe("predictions");
    expect(parseTabParam("plan-changes")).toBe("plan");
    expect(parseTabParam("cost-cash")).toBe("costcash");
    expect(parseTabParam("nope")).toBeNull();
    expect(parseTabParam(null)).toBeNull();
    expect(parseFindingParam("12")).toBe(12);
    expect(parseFindingParam("0")).toBeNull();
    expect(parseFindingParam("-3")).toBeNull();
    expect(parseFindingParam("1e3")).toBeNull();
    expect(parseFindingParam("12abc")).toBeNull();
  });
});

describe("forecast helpers", () => {
  it("uses the backend display text, else the probability as a percent, else null", () => {
    expect(probabilityText({ on_time_probability: "0.0250", probability_display: "< 5 %" })).toBe("< 5 %");
    expect(probabilityText({ on_time_probability: "0.7300", probability_display: null })).toBe("73 %");
    expect(probabilityText({ on_time_probability: null, probability_display: null })).toBeNull();
  });

  it("detects fixed bands from spread mode or INSUFFICIENT_HISTORY", () => {
    expect(isFixedBands({ spread_mode: "FIXED_BANDS", reason_codes: [], on_time_probability: null })).toBe(true);
    expect(isFixedBands({ spread_mode: null, reason_codes: ["INSUFFICIENT_HISTORY"], on_time_probability: null })).toBe(true);
    expect(isFixedBands({ spread_mode: "EMPIRICAL_SPREAD", reason_codes: [], on_time_probability: "0.5000" })).toBe(false);
  });
});

describe("anomaly window", () => {
  it("allows at most 31 days and From not after To", () => {
    expect(anomalyWindowError("2026-11-01", "2026-11-01")).toBe("");
    expect(anomalyWindowError("2026-10-01", "2026-10-31")).toBe("");
    expect(anomalyWindowError("2026-10-01", "2026-11-01")).toBe("The window can be at most 31 days (now 32).");
    expect(anomalyWindowError("2026-11-05", "2026-11-01")).toBe("From must not be after To.");
    expect(anomalyWindowError("", "2026-11-01")).toBe("Choose both dates.");
  });

  it("formats values by metric", () => {
    expect(anomalyValue("HOURLY_OUTPUT", "45.000")).toBe("45 pcs");
    expect(anomalyValue("EFFICIENCY", "38.50")).toBe("38.5%");
    expect(anomalyValue("REJECTION_RATE", null)).toBe("—");
  });
});

describe("recommendation helpers", () => {
  it("allows a decision only on open, undecided findings", () => {
    expect(canDecide({ status: "OPEN", decision_status: null })).toBe(true);
    expect(canDecide({ status: "OPEN", decision_status: "ACCEPTED" })).toBe(false);
    expect(canDecide({ status: "CLEARED", decision_status: null })).toBe(false);
  });

  it("requires a reject note and caps every note at 500 characters", () => {
    expect(decisionNoteError("ACCEPTED", "")).toBe("");
    expect(decisionNoteError("REJECTED", "no")).toMatch(/at least 5/);
    expect(decisionNoteError("REJECTED", "Line 3 already rebalanced")).toBe("");
    expect(decisionNoteError("ACCEPTED", "x".repeat(501))).toMatch(/at most 500/);
  });

  it("explains 403 / 404 / 409 failures in plain words", () => {
    expect(actionError(new ApiError("nope", 403), "record this decision")).toMatch(/not allowed/);
    expect(actionError(new ApiError("Not Found", 404), "explain this finding")).toMatch(/not available on the server yet/);
    expect(actionError(new ApiError("Finding is not open", 409), "record this decision")).toBe("Finding is not open");
  });

  it("maps decisions to the request values and recognises AI wording", () => {
    expect(toDecisionInput("ACCEPTED")).toBe("ACCEPT");
    expect(toDecisionInput("REJECTED")).toBe("REJECT");
    expect(isAiWording({ source: "ai", tag: "AI_TEXT" })).toBe(true);
    expect(isAiWording({ source: "rules", tag: "RULES" })).toBe(false);
  });

  it("prefers the screen stored by the daily job; Control Tower links switch the tab", () => {
    const withScreen = (href: string, label: string) => ({ kind: "DELIVERY_RISK", order_id: 5, payload: { recommendation: { action: "x", screen: { href, label } } } });
    expect(screenForFinding(withScreen("/app/control-tower?tab=plan-changes&order=5", "Plan changes"), true)).toEqual({
      label: "Open Plan changes",
      href: null,
      tab: "plan",
    });
    expect(screenForFinding(withScreen("/app/production/line-plan?line=3", "Line plan"), false)).toEqual({
      label: "Open Line plan",
      href: "/app/production/line-plan?line=3",
    });
    expect(screenForFinding(withScreen("https://evil.example/x", "Bad"), false).href).toBe("/app/orders/5");
  });

  it("points each kind at the screen where people act", () => {
    expect(screenForFinding({ kind: "LATE_MATERIAL", order_id: 5 }, false).href).toBe("/app/inventory/purchase-orders");
    expect(screenForFinding({ kind: "CAPACITY_OVERLOAD", order_id: null }, true)).toEqual({ label: "Open Plan changes", href: null, tab: "plan" });
    expect(screenForFinding({ kind: "LINE_IDLE", order_id: null }, false).href).toBe("/app/production/line-plan");
    expect(screenForFinding({ kind: "DELIVERY_RISK", order_id: 9 }, false).href).toBe("/app/orders/9");
    expect(screenForFinding({ kind: "QUALITY_SPIKE", order_id: null }, false).href).toBe("/app/production/hourly/sewing");
  });

  it("reads the finding payload defensively", () => {
    const d = findingDetails({
      impact_summary: "ORD-5 likely 6 days late",
      recommendation: { text: "Move 2 operators from L2" },
      facts: [{ label: "delay_days", value: 6, unit: "days" }, "Material ready 2026-11-20"],
      assumptions: ["Plan-basis efficiency"],
      alternatives: [{ text: "Overtime on Friday" }, "Split to L4"],
      approval_required: true,
      confidence: "MEDIUM",
      reason_codes: ["INSUFFICIENT_HISTORY"],
      days_affected: 4,
      nested: { ignored: true },
    });
    expect(d.summary).toBe("ORD-5 likely 6 days late");
    expect(d.recommendation).toBe("Move 2 operators from L2");
    expect(d.facts).toEqual([
      { label: "Delay days", value: "6 days" },
      { label: "Fact", value: "Material ready 2026-11-20" },
    ]);
    expect(d.alternatives).toEqual(["Overtime on Friday", "Split to L4"]);
    expect(d.approval).toMatch(/^Yes/);
    expect(d.confidence).toBe("MEDIUM");
    expect(d.reasonCodes).toEqual(["INSUFFICIENT_HISTORY"]);
    expect(d.other).toEqual([]);
    expect(findingDetails(null).facts).toEqual([]);
  });

  it("reads the payload written by the bottleneck builder", () => {
    const d = findingDetails({
      kind: "CAPACITY_OVERLOAD",
      kind_label: "Line overloaded",
      subject: { line_code: "L3" },
      facts: [
        { id: "days", label: "overloaded days", value: "4", unit: "days" },
        { id: "util", label: "peak utilization", value: "128.5000", unit: "percent" },
        { id: "orders", label: "orders on the line", value: "3", unit: "count" },
      ],
      dates: { first_day: "2026-11-15", p50_date: null },
      affected_dates: ["2026-11-15", "2026-11-16"],
      days_affected: 4,
      orders_affected: 3,
      reason_codes: ["OVERLOADED"],
      confidence: "HIGH",
      recommendation: { action: "Move a booking to an idle line.", screen: { href: "/app/production/line-plan?line=3", label: "Line plan" } },
      alternatives: ["Overtime"],
      approval_requirement: "Plan changes follow the existing plan approval.",
      assumptions: ["Deterministic rule result"],
      order_ids: [1, 2, 3],
    });
    expect(d.summary).toBe("4 day(s) affected · 3 orders");
    expect(d.recommendation).toBe("Move a booking to an idle line.");
    expect(d.facts).toEqual([
      { label: "Overloaded days", value: "4 days" },
      { label: "Peak utilization", value: "128.5%" },
      { label: "Orders on the line", value: "3" },
    ]);
    expect(d.dates).toEqual([
      { label: "First day", value: "15/11/2026" },
      { label: "Affected days", value: "15/11/2026, 16/11/2026" },
    ]);
    expect(d.approval).toBe("Plan changes follow the existing plan approval.");
    expect(d.other).toEqual([{ label: "Order ids", value: "1, 2, 3" }]);
  });
});
