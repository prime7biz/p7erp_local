import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/core";
import type { LineBooking } from "@/api/mfgPlanning";

import { warningLabel } from "../reasonLabels";
import {
  approveErrorMessage,
  assignmentPatch,
  bookingDraftErrors,
  buildUpdateItem,
  canManageHardMaterial,
  draftFromBooking,
  expiryError,
  friendlyError,
  isPercentText,
  isPositiveDecimalText,
  isStaleAllocation,
  newRequestId,
  readPhase2Flags,
  releaseNeedsManager,
  sameDecimal,
  smvDraftErrors,
  tentativeDraftErrors,
  visibleTabs,
} from "./phase2Logic";

const booking: LineBooking = {
  id: 7,
  line_id: 1,
  order_id: 5,
  order_code: "ORD-5",
  order_status: "CONFIRMED",
  style_id: null,
  ob_id: null,
  shift_id: null,
  reservation_status: "SOFT_BOOKED",
  start_date: "2026-11-20",
  planned_end_date: "2026-11-30",
  planned_qty: "1000.000",
  completed_qty: "0.000",
  operator_count: 30,
  target_efficiency_pct: "60.00",
  smv_per_piece: null,
  source_smv_type: null,
  lock_version: 2,
  schedule_version: 0,
};

describe("phase 2 flags and tabs", () => {
  it("treats only strict true as on", () => {
    expect(readPhase2Flags({ mfg_material_allocation_v1: "true", mfg_integrated_planning_v1: 1 })).toEqual({
      allocation: false,
      integrated: false,
      fourEyes: false,
    });
    expect(readPhase2Flags({ mfg_material_allocation_v1: true, mfg_plan_four_eyes: true }).allocation).toBe(true);
    expect(readPhase2Flags(undefined).integrated).toBe(false);
  });

  it("shows Materials only with allocation and the three planning tabs only with integrated planning", () => {
    expect(visibleTabs({ allocation: false, integrated: false, fourEyes: false }).map((t) => t.id)).toEqual(["overview"]);
    expect(visibleTabs({ allocation: true, integrated: false, fourEyes: true }).map((t) => t.label)).toEqual(["Overview", "Materials"]);
    expect(visibleTabs({ allocation: true, integrated: true, fourEyes: false }).map((t) => t.label)).toEqual([
      "Overview",
      "Materials",
      "Plan changes",
      "Tentative demand",
      "People & machines",
    ]);
  });
});

describe("decimal text checks (no float maths)", () => {
  it("validates positive decimals and percents on the text", () => {
    expect(isPositiveDecimalText("12.5")).toBe(true);
    expect(isPositiveDecimalText("0.000")).toBe(false);
    expect(isPositiveDecimalText("1.23456")).toBe(false);
    expect(isPositiveDecimalText("-1")).toBe(false);
    expect(isPositiveDecimalText("1e3")).toBe(false);
    expect(isPercentText("100")).toBe(true);
    expect(isPercentText("100.00")).toBe(true);
    expect(isPercentText("100.01")).toBe(false);
    expect(isPercentText("0")).toBe(true);
    expect(isPercentText("250")).toBe(false);
    expect(sameDecimal("1000.000", "1000")).toBe(true);
    expect(sameDecimal("60.50", "60.5")).toBe(true);
    expect(sameDecimal("60.5", "6.05")).toBe(false);
  });
});

describe("errors", () => {
  it("recognises the stale allocation 409 and four-eyes / stale approve errors", () => {
    expect(isStaleAllocation(new ApiError("changed", 409, null, "STALE_STATE"))).toBe(true);
    expect(isStaleAllocation(new ApiError("not open", 409, null, "ORDER_NOT_OPEN"))).toBe(false);
    expect(approveErrorMessage(new ApiError("The revision changed since you loaded it", 409))).toMatch(/the list was reloaded - review it again/);
    expect(approveErrorMessage(new ApiError("Four-eyes rule: the person who proposed a plan change cannot approve it", 403))).toMatch(/someone other than the proposer/);
    expect(approveErrorMessage(new ApiError("only a confirmed order can have a FIRM_BOOKED row", 422))).toMatch(/FIRM_BOOKED/);
    expect(friendlyError(new ApiError("Requires admin or manager role", 403))).toBe("You are not allowed to do this: Requires admin or manager role");
    expect(friendlyError(new ApiError("Not Found", 404))).toMatch(/switched off/);
  });

  it("creates unique request ids", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});

describe("materials rules", () => {
  it("admin / manager only for hard holds of confirmed orders", () => {
    expect(canManageHardMaterial("Manager")).toBe(true);
    expect(canManageHardMaterial("admin")).toBe(true);
    expect(canManageHardMaterial("owner")).toBe(false);
    expect(canManageHardMaterial("planner")).toBe(false);
    expect(releaseNeedsManager(true, "CONFIRMED")).toBe(true);
    expect(releaseNeedsManager(true, "DRAFT")).toBe(false);
    expect(releaseNeedsManager(false, "CONFIRMED")).toBe(false);
  });

  it("labels CODE:detail warnings", () => {
    expect(warningLabel("HIGHER_PRIORITY_DEMAND_PROTECTED:42")).toBe("Stock kept for a higher-priority order (42)");
    expect(warningLabel("QUEUE_TRUNCATED")).toBe("Only part of the order queue was checked");
    expect(warningLabel("free text: with colon")).toBe("free text: with colon");
  });
});

describe("plan change items", () => {
  it("sends only changed fields on UPDATE", () => {
    const d = draftFromBooking(booking);
    expect(buildUpdateItem(booking, d)).toBeNull();
    expect(buildUpdateItem(booking, { ...d, planned_qty: "1000" })).toBeNull();
    expect(buildUpdateItem(booking, { ...d, planned_qty: "1200", reservation_status: "FIRM_BOOKED" })).toEqual({
      action: "UPDATE",
      config_id: 7,
      planned_qty: "1200",
      reservation_status: "FIRM_BOOKED",
    });
    expect(buildUpdateItem(booking, { ...d, target_efficiency_pct: "60" })).toBeNull();
  });

  it("validates booking drafts", () => {
    expect(bookingDraftErrors({ line_id: "1", start_date: "2026-11-20", planned_end_date: "", planned_qty: "10" })).toEqual([]);
    const errs = bookingDraftErrors({ line_id: "", start_date: "2026-11-20", planned_end_date: "2026-11-01", planned_qty: "0", order_id: "" });
    expect(errs).toContain("Choose an order.");
    expect(errs).toContain("Choose a sewing line.");
    expect(errs).toContain("The end date must be on or after the start date.");
    expect(errs.some((e) => e.startsWith("Planned quantity"))).toBe(true);
  });
});

describe("tentative demand", () => {
  const base = {
    source: "QUOTATION" as const,
    source_id: "3",
    line_id: "1",
    start_date: "2026-11-20",
    planned_end_date: "",
    planned_qty: "500",
    confidence_pct: "",
    expires_on: "",
    notes: "",
  };
  it("needs a confidence unless a stage default exists, and an expiry within 180 days", () => {
    expect(tentativeDraftErrors(base, "2026-11-12", { confidenceDefault: false, isCreate: true })).toContain(
      "Enter a confidence % (no default is set for this stage).",
    );
    expect(tentativeDraftErrors(base, "2026-11-12", { confidenceDefault: true, isCreate: true })).toEqual([]);
    expect(tentativeDraftErrors({ ...base, confidence_pct: "120" }, "2026-11-12", { confidenceDefault: true, isCreate: true })).toContain(
      "Confidence must be between 0 and 100.",
    );
    expect(expiryError("2027-06-30", "2026-11-12")).toMatch(/at most 180 days/);
    expect(expiryError("2026-11-01", "2026-11-12")).toMatch(/today or later/);
    expect(expiryError("2026-12-01", "2026-11-12")).toBe("");
  });
});

describe("assignments and SMV", () => {
  it("builds a PATCH with only changed fields and the lock version", () => {
    const current = { sewing_line_id: 1, shift_id: null, role: "OPERATOR", valid_from: "2026-11-01", valid_to: null, notes: null, lock_version: 4 };
    const draft = { owner_id: 9, sewing_line_id: "1", shift_id: "", role: "OPERATOR", valid_from: "2026-11-01", valid_to: "", notes: "" };
    expect(assignmentPatch(current, draft, "employees")).toBeNull();
    expect(assignmentPatch(current, { ...draft, sewing_line_id: "2", role: "HELPER" }, "employees")).toEqual({
      expected_lock_version: 4,
      sewing_line_id: 2,
      role: "HELPER",
    });
  });

  it("validates the SMV editor", () => {
    expect(smvDraftErrors({ smv: "12.5", source: "IE_STUDY", confidence: "HIGH", reason: "time study 11/26" })).toEqual([]);
    const errs = smvDraftErrors({ smv: "0", source: "X", confidence: "", reason: "abc" });
    expect(errs).toHaveLength(4);
    expect(smvDraftErrors({ smv: "1000", source: "OB", confidence: "LOW", reason: "long enough" })).toContain("SMV must be below 1000 minutes.");
  });
});
