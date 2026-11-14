import { describe, expect, it } from "vitest";
import type { ExceptionItem, ForecastRow, MpAccess } from "@/api/mgmtPerformance";
import {
  exceptionActions,
  forecastRowActions,
  isDecimalText,
  isMgmtPerformanceEnabled,
  isNegative,
  newRequestId,
  parseView,
  periodOptions,
  statusTone,
  visibleViews,
} from "./mgmtPerformanceLogic";

const company: MpAccess = { allowed: true, company: true, cost_center_ids: [], can_setup: true };
const owner: MpAccess = { allowed: true, company: false, cost_center_ids: [7], can_setup: false };

function row(extra: Partial<ForecastRow> = {}): ForecastRow {
  return {
    cost_center_id: 7, cost_center_label: "CC7", department: null, owner_user_id: 3, category: "UTILITIES",
    category_label: "Utilities", budget: "100.0000", actual: "50.0000", committed: "0.0000", forecast: "90.0000",
    variance: "10.0000", used_pct: "90.0000", run_rate: null, history_avg: "0.0000", warning_pct: "90.0000",
    status: "WARNING", sources: ["BUDGET_TIME_PHASED"], restricted: false, budget_line_ids: [11],
    months: [{ month: "2026-11", kind: "current", budget: "100.0000", actual: "50.0000", committed: "0.0000", forecast: "90.0000", source: "BUDGET_TIME_PHASED" }],
    ...extra,
  };
}

describe("mgmtPerformanceLogic", () => {
  it("flag is strict true only", () => {
    expect(isMgmtPerformanceEnabled({ mgmt_performance_v1: true })).toBe(true);
    expect(isMgmtPerformanceEnabled({ mgmt_performance_v1: "true" })).toBe(false);
    expect(isMgmtPerformanceEnabled(undefined)).toBe(false);
  });

  it("owners only get the budget, exception and revision views", () => {
    expect(visibleViews(owner).map((v) => v.id)).toEqual(["budget", "exceptions", "revisions"]);
    expect(visibleViews(company)).toHaveLength(8);
    expect(visibleViews({ allowed: false, company: false, cost_center_ids: [] })).toEqual([]);
    expect(parseView("cash", owner)).toBe("budget");
    expect(parseView("cash", company)).toBe("cash");
    expect(parseView(null, company)).toBe("overview");
  });

  it("row actions: request change only for the owner or setup users, never on restricted payroll", () => {
    expect(forecastRowActions(row(), owner).map((a) => a.id)).toEqual(["months", "revise", "exceptions"]);
    expect(forecastRowActions(row({ cost_center_id: 8 }), owner).map((a) => a.id)).toEqual(["months", "exceptions"]);
    expect(forecastRowActions(row({ restricted: true, months: [] }), company).map((a) => a.id)).toEqual(["exceptions"]);
    expect(forecastRowActions(row({ status: "OK", budget_line_ids: [] }), company).map((a) => a.id)).toEqual(["months"]);
  });

  it("exception actions follow the server's can_* flags; reject is the danger item", () => {
    const base = { can_respond: false, can_review: false, can_decide: true, status: "REVIEWED" } as ExceptionItem;
    expect(exceptionActions(base)).toEqual([
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject", danger: true },
    ]);
    expect(exceptionActions({ ...base, can_decide: false, can_respond: true, status: "REJECTED" })[0]?.label).toBe("Answer again");
  });

  it("decimal text, negatives and tones never use float maths", () => {
    expect(isDecimalText("1500.25")).toBe(true);
    expect(isDecimalText("-1")).toBe(false);
    expect(isDecimalText("1.23456")).toBe(false);
    expect(isNegative("-0.0000")).toBe(false);
    expect(isNegative("-12.5000")).toBe(true);
    expect(statusTone("FAILED")).toBe("danger");
    expect(statusTone("WARNING")).toBe("warning");
    expect(statusTone("OK")).toBe("ok");
  });

  it("request ids match the server pattern and differ", () => {
    const a = newRequestId("exc");
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newRequestId("exc")).not.toBe(a);
  });

  it("period options follow the financial year", () => {
    const opts = periodOptions("2026-11-14", 7);
    expect(opts.map((o) => o.value)).toEqual(["2026-11", "2026-10", "2026-09", "2026-Q2", "FY2026"]);
    expect(periodOptions("2026-01-05", 1).map((o) => o.value)).toEqual(["2026-01", "2025-12", "2025-11", "2026-Q1", "FY2026"]);
  });
});
