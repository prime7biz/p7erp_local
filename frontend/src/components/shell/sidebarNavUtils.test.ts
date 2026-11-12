import { describe, expect, it } from "vitest";
import { bottomNavItems, menuSections } from "@/app/sidebarConfig";
import { mobileMenuSections, pickMobileTabs } from "@/components/navigation/mobileNavLogic";
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

  it("shows the new finance page links only for a strict true flag (hubs OFF)", () => {
    const ctx = { tenantType: "both" as const, enabledOptionalProductionUnits: [], hasPermission: allow };
    const off = allHrefs(filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: {} }));
    const on = allHrefs(
      filterVisibleMenuSections(menuSections, {
        ...ctx,
        featureFlags: { finance_statements_v2: true, finance_budget_analytics_v2: true, finance_control_tower_v2: true },
      }),
    );
    expect(off).not.toContain("/app/finance/control-tower");
    expect(off).not.toContain("/app/finance/statements/trial-balance");
    expect(on).toContain("/app/finance/control-tower");
    expect(on).toContain("/app/finance/statements/trial-balance");
    expect(on).toContain("/app/finance/budget-analytics");
    expect(on).toContain("/app/finance/profitability/entity");
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

describe("mobile_ui_v2 menu trimming", () => {
  const ctx = { tenantType: "both" as const, enabledOptionalProductionUnits: [], hasPermission: allow };

  it("does not change the desktop sidebar / search sections", () => {
    const off = filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: {} }).map((s) => s.section);
    const on = filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: { mobile_ui_v2: true } }).map((s) => s.section);
    expect(on).toEqual(off);
    expect(on).toEqual(expect.arrayContaining(["Reports", "AI Tools", "Settings"]));
  });

  it("only drops the sections marked hideInMobileMenu from the More menu", () => {
    const all = filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: {} });
    const phone = mobileMenuSections(all).map((s) => s.section);
    expect(all.map((s) => s.section).filter((n) => !phone.includes(n)).sort()).toEqual(["AI Tools", "Reports", "Settings"]);
  });

  it("never adds a section the user cannot see", () => {
    const visible = filterVisibleMenuSections(menuSections, {
      ...ctx,
      featureFlags: { rbac_enforcement: "enforce" },
      hasPermission: denyFinance,
    });
    expect(mobileMenuSections(visible).map((s) => s.section)).not.toContain("Finance");
    expect(pickMobileTabs(new Set(visible.map((s) => s.section))).map((t) => t.key)).toEqual([
      "home",
      "sales",
      "inventory",
      "production",
      "more",
    ]);
  });
});
