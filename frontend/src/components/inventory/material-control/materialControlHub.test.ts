import { describe, expect, it } from "vitest";
import routerSource from "@/app/AppProtectedRouter.tsx?raw";
import { findHubLegacyTarget } from "@/components/app/hubs/hubNavigation";
import { isHubTabVisible } from "@/components/app/hubs/hubVisibility";
import { MATERIAL_CONTROL_HUB } from "./materialControlHub";

describe("Material Control hub wiring", () => {
  it("registers every legacyPath as a HubLegacyRedirect route in AppProtectedRouter", () => {
    for (const tab of MATERIAL_CONTROL_HUB.tabs) {
      expect(tab.legacyPath).toBeTruthy();
      expect(routerSource).toContain(`path="${tab.legacyPath}"`);
      expect(routerSource).toContain(`from="${tab.legacyPath}"`);
      expect(findHubLegacyTarget([MATERIAL_CONTROL_HUB], tab.legacyPath!)?.tab.id).toBe(tab.id);
    }
  });

  it("shows Bond/Claim/RTV when physical OR returns is on (page gates inbound_job_work)", () => {
    const ops = MATERIAL_CONTROL_HUB.tabs.find((t) => t.id === "ops")!;
    expect(ops.requiresAnyFeatureFlag).toEqual(["material_physical_v1", "material_returns_v1"]);
    expect(isHubTabVisible(ops, {})).toBe(false);
    expect(isHubTabVisible(ops, { material_physical_v1: true })).toBe(true);
    expect(isHubTabVisible(ops, { material_returns_v1: true })).toBe(true);
    expect(isHubTabVisible(ops, { material_physical_v1: "true" as never })).toBe(false);
  });
});
