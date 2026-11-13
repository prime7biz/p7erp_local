import { describe, expect, it } from "vitest";

import { visibleTabs } from "../phase2/phase2Logic";
import {
  cashCategoryLabel,
  dayFieldError,
  horizonError,
  isNegativeText,
  money,
  moneyLoadError,
  NO_PHASE3,
  ratioToPercentText,
  readPhase3Flags,
  showCostCashTab,
  splitNote,
  valueClassLabel,
  valueClassTone,
} from "./phase3Logic";

describe("phase3 flags and tab gating", () => {
  it("reads the flags strictly (only === true is on)", () => {
    expect(readPhase3Flags(undefined)).toEqual(NO_PHASE3);
    expect(readPhase3Flags({ mfg_cost_intelligence_v1: "true", mfg_financial_readiness_v1: 1 })).toEqual(NO_PHASE3);
    expect(readPhase3Flags({ mfg_cost_intelligence_v1: true })).toEqual({ cost: true, cash: false });
    expect(readPhase3Flags({ mfg_financial_readiness_v1: true })).toEqual({ cost: false, cash: true });
  });

  it("shows Cost & cash only with a flag AND can_view_finance === true", () => {
    expect(showCostCashTab(NO_PHASE3, true)).toBe(false);
    expect(showCostCashTab({ cost: true, cash: false }, undefined)).toBe(false);
    expect(showCostCashTab({ cost: true, cash: false }, false)).toBe(false);
    expect(showCostCashTab({ cost: false, cash: true }, true)).toBe(true);
  });

  it("adds the tab last and leaves the Phase 2 tabs unchanged", () => {
    const p2 = { allocation: true, integrated: false, fourEyes: false };
    expect(visibleTabs(p2).map((t) => t.id)).toEqual(["overview", "materials"]);
    expect(visibleTabs(p2, { costCash: true }).map((t) => t.label)).toEqual(["Overview", "Materials", "Cost & cash"]);
  });
});

describe("phase3 display helpers (text only, no float maths)", () => {
  it("labels value classes", () => {
    expect(valueClassLabel("ESTIMATED")).toBe("Estimate");
    expect(valueClassLabel("ACTUAL")).toBe("Actual");
    expect(valueClassTone("COMMITTED")).toBe("info");
    expect(valueClassTone("FORECAST")).toBe("neutral");
  });

  it("detects negative decimal text", () => {
    expect(isNegativeText("-12.5000")).toBe(true);
    expect(isNegativeText("-0.0000")).toBe(false);
    expect(isNegativeText("3.0000")).toBe(false);
    expect(isNegativeText(null)).toBe(false);
  });

  it("turns a progress ratio into percent text by moving the decimal point", () => {
    expect(ratioToPercentText("0.4500")).toBe("45.00");
    expect(ratioToPercentText("1.0000")).toBe("100.00");
    expect(ratioToPercentText("0.0512")).toBe("5.12");
    expect(ratioToPercentText(null)).toBeNull();
    expect(ratioToPercentText("abc")).toBeNull();
  });

  it("formats money with 2 decimals and a dash for empty", () => {
    expect(money("1234.5000")).toBe("1,234.5");
    expect(money(null)).toBe("—");
  });

  it("splits coded notes", () => {
    expect(splitNote("STALE_PAYABLES: 3 bills left out")).toEqual({ code: "STALE_PAYABLES", text: "3 bills left out" });
    expect(splitNote("Overdue items are shown in week 1.")).toEqual({ code: null, text: "Overdue items are shown in week 1." });
  });

  it("labels cash categories and falls back for new codes", () => {
    expect(cashCategoryLabel("BTB_MATURITY")).toBe("BTB LC payment");
    expect(cashCategoryLabel("NEW_THING")).toBe("New thing");
  });
});

describe("phase3 input and error messages", () => {
  it("validates the horizon", () => {
    expect(horizonError("90")).toBe("");
    expect(horizonError("0")).toMatch(/between 1 and 180/);
    expect(horizonError("181")).toMatch(/between 1 and 180/);
    expect(horizonError("9.5")).toMatch(/whole number/);
  });

  it("validates day settings", () => {
    expect(dayFieldError("Export document days", "7", 0, 60)).toBe("");
    expect(dayFieldError("Export document days", "61", 0, 60)).toBe("Export document days must be 0-60.");
    expect(dayFieldError("BTB usance days", "", 0, 365)).toMatch(/whole number/);
  });

  it("explains 404, 403 and 422", () => {
    expect(moneyLoadError(404, "Not found", "Cash requirement")).toMatch(/switched off/);
    expect(moneyLoadError(403, "Forbidden", "Cash requirement")).toMatch(/finance access/);
    expect(moneyLoadError(422, "horizon_days too big", "Cash requirement")).toMatch(/horizon_days too big/);
    expect(moneyLoadError(500, "Boom", "x")).toBe("Boom");
  });
});
