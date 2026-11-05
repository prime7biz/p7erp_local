import { describe, expect, it } from "vitest";
import { hiddenEnabledCount, tierVisible } from "./featureTiers";

describe("feature tiers", () => {
  it("shows sections up to the selected tier", () => {
    expect(tierVisible("essential", "essential")).toBe(true);
    expect(tierVisible("more", "essential")).toBe(false);
    expect(tierVisible("more", "more")).toBe(true);
    expect(tierVisible("all", "more")).toBe(false);
    expect(tierVisible("all", "all")).toBe(true);
  });

  it("counts switches that are on but hidden", () => {
    const flags = { procurement_cs_enabled: true, tds_system_enabled: true, knitting_enabled: false, trade_enabled: true };
    expect(hiddenEnabledCount(flags, "essential")).toBe(2);
    expect(hiddenEnabledCount(flags, "more")).toBe(1);
    expect(hiddenEnabledCount(flags, "all")).toBe(0);
  });
});
