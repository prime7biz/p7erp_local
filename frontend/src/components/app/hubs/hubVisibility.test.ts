import { describe, expect, it } from "vitest";
import { Banknote } from "lucide-react";
import { findHubLegacyTarget, hubHref, hubTabPaletteRoutes, resolveHubHelpPath } from "./hubNavigation";
import { isHubTabVisible, isHubVisible, pickActiveHubTab, visibleHubTabs } from "./hubVisibility";
import type { Hub, HubTab } from "./types";

const load = () => Promise.resolve({ default: () => null });

function tab(extra: Partial<HubTab> & { id: string }): HubTab {
  return { label: extra.id, legacyPath: `x/${extra.id}`, load, ...extra };
}

const hub: Hub = {
  id: "demo",
  path: "demo/hub",
  label: "Demo",
  description: "Demo hub",
  icon: Banknote,
  permissionKey: "demo.access",
  tabs: [
    tab({ id: "plain" }),
    tab({ id: "strict", requiresFeatureFlag: "strict_flag" }),
    tab({ id: "default-on", hideWhenFeatureFlagFalse: "mis_flag" }),
    tab({ id: "secret", permissionKey: "demo.secret" }),
    tab({ id: "own-page", standalone: true }),
  ],
};

const allow = () => true;

describe("hub tab visibility", () => {
  it("strict flag: shown only when the flag is exactly true", () => {
    const t = hub.tabs[1]!;
    for (const flags of [undefined, null, {}, { strict_flag: false }, { strict_flag: "true" }, { strict_flag: 1 }]) {
      expect(isHubTabVisible(t, flags as never)).toBe(false);
    }
    expect(isHubTabVisible(t, { strict_flag: true })).toBe(true);
  });

  it("default-on flag: hidden only when the flag is exactly false", () => {
    const t = hub.tabs[2]!;
    for (const flags of [undefined, null, {}, { mis_flag: true }, { mis_flag: null }, { mis_flag: "false" }]) {
      expect(isHubTabVisible(t, flags as never)).toBe(true);
    }
    expect(isHubTabVisible(t, { mis_flag: false })).toBe(false);
  });

  it("permission key filters navigation only when a check is given", () => {
    const t = hub.tabs[3]!;
    expect(isHubTabVisible(t, {})).toBe(true);
    expect(isHubTabVisible(t, {}, (k) => k !== "demo.secret")).toBe(false);
    expect(isHubTabVisible(t, {}, allow)).toBe(true);
  });

  it("a standalone tab is never embedded", () => {
    expect(visibleHubTabs(hub, { strict_flag: true }, allow).map((t) => t.id)).toEqual([
      "plain",
      "strict",
      "default-on",
      "secret",
    ]);
  });

  it("falls back to the first visible tab for unknown, switched-off or forbidden tabs", () => {
    const deny = (k: string) => k !== "demo.secret";
    expect(pickActiveHubTab(hub, "nope", {}, deny)?.id).toBe("plain");
    expect(pickActiveHubTab(hub, null, {}, deny)?.id).toBe("plain");
    expect(pickActiveHubTab(hub, "strict", {}, deny)?.id).toBe("plain");
    expect(pickActiveHubTab(hub, "secret", {}, deny)?.id).toBe("plain");
    expect(pickActiveHubTab(hub, "own-page", {}, deny)?.id).toBe("plain");
    expect(pickActiveHubTab(hub, "strict", { strict_flag: true }, deny)?.id).toBe("strict");
  });

  it("a hub with no visible tab is hidden unless showWhenEmpty; hub permission is respected", () => {
    const empty: Hub = { ...hub, tabs: [tab({ id: "a", requiresFeatureFlag: "off" })] };
    expect(isHubVisible(empty, {}, allow)).toBe(false);
    expect(isHubVisible({ ...empty, showWhenEmpty: true }, {}, allow)).toBe(true);
    expect(isHubVisible(hub, {}, (k) => k !== "demo.access")).toBe(false);
    expect(isHubVisible(hub, {}, allow)).toBe(true);
  });
});

describe("hub navigation helpers", () => {
  it("builds hub links and finds the hub tab of an old path", () => {
    expect(hubHref(hub)).toBe("/app/demo/hub");
    expect(hubHref(hub, "strict")).toBe("/app/demo/hub?tab=strict");
    expect(findHubLegacyTarget([hub], "x/plain")?.tab.id).toBe("plain");
    expect(findHubLegacyTarget([hub], "x/own-page")).toBeNull();
    expect(findHubLegacyTarget([hub], "x/unknown")).toBeNull();
  });

  it("resolves Help to the open tab's old route and passes other paths through", () => {
    expect(resolveHubHelpPath([hub], "/app/demo/hub", "?tab=secret", {}, allow)).toBe("/app/x/secret");
    expect(resolveHubHelpPath([hub], "/app/demo/hub/", "", {}, allow)).toBe("/app/x/plain");
    expect(resolveHubHelpPath([hub], "/app/demo/hub", "?tab=strict", {}, allow)).toBe("/app/x/plain");
    expect(resolveHubHelpPath([hub], "/app/other", "?tab=strict")).toBe("/app/other");
  });

  it("lists only visible tabs of allowed hubs for the palette", () => {
    const rows = hubTabPaletteRoutes([hub], "Demo", {}, allow);
    expect(rows.map((r) => r.href)).toEqual([
      "/app/demo/hub?tab=plain",
      "/app/demo/hub?tab=default-on",
      "/app/demo/hub?tab=secret",
    ]);
    expect(rows[0]?.section).toBe("Demo · Demo");
    expect(hubTabPaletteRoutes([hub], "Demo", {}, (k) => k !== "demo.access")).toEqual([]);
  });
});
