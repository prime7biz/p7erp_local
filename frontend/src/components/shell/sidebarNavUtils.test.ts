import { describe, expect, it } from "vitest";
import { bottomNavItems, menuSections } from "@/app/sidebarConfig";
import { filterVisibleMenuSections, isMenuPermissionAllowed } from "./sidebarNavUtils";

const allow = () => true;
const denyFinance = (key: string) => key !== "finance.access";
const enforce = { rbac_enforcement: "enforce" };

function sectionNames(sections: { section: string }[]) {
  return sections.map((s) => s.section);
}

function allHrefs(sections: ReturnType<typeof filterVisibleMenuSections>): string[] {
  return sections.flatMap((s) => [
    ...(s.directLink ? [s.directLink] : []),
    ...s.items.map((i) => i.href),
    ...(s.subsections ?? []).flatMap((sub) => sub.items.map((i) => i.href)),
  ]);
}

describe("filterVisibleMenuSections", () => {
  it("shows every section with pages when RBAC is off", () => {
    const visible = filterVisibleMenuSections(menuSections, {
      tenantType: "both",
      enabledOptionalProductionUnits: [],
      featureFlags: {},
      hasPermission: () => false,
    });
    expect(sectionNames(visible)).toContain("Finance");
    expect(sectionNames(visible)).toContain("Settings");
  });

  it("hides a section whose permission is denied while RBAC is enforced", () => {
    const visible = filterVisibleMenuSections(menuSections, {
      tenantType: "both",
      enabledOptionalProductionUnits: [],
      featureFlags: enforce,
      hasPermission: denyFinance,
    });
    expect(sectionNames(visible)).not.toContain("Finance");
    expect(sectionNames(visible)).toContain("Inventory");
  });

  it("shows optional production units only when they are enabled", () => {
    const ctx = { tenantType: "manufacturer" as const, featureFlags: {}, hasPermission: allow };
    const off = allHrefs(filterVisibleMenuSections(menuSections, { ...ctx, enabledOptionalProductionUnits: [] }));
    const on = allHrefs(filterVisibleMenuSections(menuSections, { ...ctx, enabledOptionalProductionUnits: ["dyeing"] }));
    expect(off).not.toContain("/app/production/dyeing");
    expect(on).toContain("/app/production/dyeing");
  });

  it("hides trade pages when trade_enabled is false", () => {
    const ctx = { tenantType: "buying_house" as const, enabledOptionalProductionUnits: [], hasPermission: allow };
    expect(allHrefs(filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: {} }))).toContain("/app/trade/cases");
    expect(
      allHrefs(filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: { trade_enabled: false } })),
    ).not.toContain("/app/trade/cases");
  });

  it("never returns an empty section", () => {
    const visible = filterVisibleMenuSections(menuSections, {
      tenantType: "buying_house",
      enabledOptionalProductionUnits: [],
      featureFlags: {},
      hasPermission: allow,
    });
    for (const s of visible) {
      const pages = s.subsections?.length
        ? s.subsections.reduce((n, sub) => n + sub.items.length, 0)
        : s.items.length;
      expect(Boolean(s.directLink) || pages > 0).toBe(true);
    }
  });
});

describe("bottom nav permissions", () => {
  it("hides the Finance tab when finance access is denied under enforcement", () => {
    const tabs = bottomNavItems.filter((t) => isMenuPermissionAllowed(t.permissionKey, enforce, denyFinance));
    expect(tabs.map((t) => t.key)).not.toContain("finance");
    expect(tabs.map((t) => t.key)).toContain("more");
  });

  it("keeps every tab when RBAC is not enforced", () => {
    const tabs = bottomNavItems.filter((t) => isMenuPermissionAllowed(t.permissionKey, {}, denyFinance));
    expect(tabs).toHaveLength(bottomNavItems.length);
  });
});
