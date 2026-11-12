import { describe, expect, it } from "vitest";
import routerSource from "@/app/AppProtectedRouter.tsx?raw";
import { menuSections } from "@/app/sidebarConfig";
import { isHubTabVisible, visibleHubTabs } from "@/components/app/hubs/hubVisibility";
import type { Hub } from "@/components/app/hubs/types";
import { filterVisibleMenuSections } from "@/components/shell/sidebarNavUtils";
import { FINANCE_HUBS, isFinanceHubsV2Enabled } from "./financeHubs";
import { findHubLegacyTarget } from "@/components/app/hubs/hubNavigation";
import { financeTabPaletteRoutes, resolveFinanceHelpPath } from "./financeNavigation";

const hubs: readonly Hub[] = FINANCE_HUBS;

/** Hub tab paths that were standalone Finance list pages before the hubs (relative to /app). */
const EMBEDDABLE_ROUTES = [
  "accounts/vouchers",
  "accounts/vouchers/approval-queue",
  "accounts/outstanding-bills",
  "accounts/vendor-bills",
  "accounts/purchase-workflow",
  "finance/party-ledgers",
  "finance/recurring-vouchers",
  "finance/registers/post-dated",
  "finance/registers/memorandum",
  "banking/accounts",
  "banking/reconciliation",
  "banking/payment-runs",
  "banking/payment-advice",
  "banking/settlement-audit",
  "finance/fx-receipts",
  "accounts/reports/trial-balance",
  "accounts/reports/financial-statements",
  "accounts/reports/cash-flow",
  "finance/mis/fund-flow",
  "accounts/reports/ratio-analysis",
  "accounts/reports/day-book",
  "accounts/reports/ar-ap-aging",
  "accounts/reports/ledger-activity",
  "accounts/reports/exceptions",
  "accounts/reports/voucher-analytics",
  "accounts/reports/group-summary",
  "finance/mis",
  "finance/mis/ratios",
  "finance/mis/comparative",
  "finance/mis/cash-scenarios",
  "accounts/budgets",
  "finance/cash-forecast",
  "cashflow/calendar",
  "finance/style-profitability",
  "finance/lc-profitability",
  "finance/costing-variance",
  "finance/tax-ledgers",
  "finance/gst/returns",
  "finance/gst/settings",
  "finance/tds",
  "finance/tds/reports",
  "finance/facilities/dashboard",
  "finance/facilities",
  "finance/business-overview",
  "accounts/advance-options",
  "accounts/groups",
  "accounts",
  "accounts/cost-centers",
  "accounts/currency",
  "accounts/accounting-periods",
  "finance/voucher-types",
  "finance/voucher-classes",
];

/** Routes that must stay normal pages in both modes (detail, create, print, cheque, requisitions). */
const STANDALONE_ROUTES = [
  "accounts/vouchers/print",
  "accounts/vouchers/:voucherId",
  "finance/party-ledgers/new",
  "finance/party-ledgers/:id",
  "finance/credit-notes/new",
  "finance/debit-notes/new",
  "finance/stock-transfer-vouchers/new",
  "finance/facilities/new",
  "finance/facilities/:facilityId",
  "finance/facilities/:facilityId/utilizations/new",
  "finance/utilizations/:utilizationId",
  "procurement/requisitions",
  "procurement/requisitions/:requisitionId",
];

/** The cheque print route lives outside the shell, above the guards. */
const CHEQUE_ROUTE = "accounts/vouchers/:voucherId/cheque";

function routeElement(path: string): string | null {
  const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const match = routerSource.match(new RegExp(`<Route\\s+path="${escaped}"\\s+element=\\{(<.*?/>)\\} />`));
  return match?.[1] ?? null;
}

function guardBlock(permission: "finance" | "facility"): string {
  const start = routerSource.indexOf(`<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.${permission}} />`);
  const end = routerSource.indexOf("</Route>", start);
  expect(start).toBeGreaterThan(-1);
  return routerSource.slice(start, end);
}

describe("Finance hub route contract", () => {
  it("wraps every embeddable old Finance route with the flag-aware redirect", () => {
    const problems: string[] = [];
    for (const path of EMBEDDABLE_ROUTES) {
      const element = routeElement(path);
      if (!element) {
        problems.push(`${path}: no <Route>`);
        continue;
      }
      if (!element.startsWith(`<FinanceLegacyRoute from="${path}" Page={`)) {
        problems.push(`${path}: expected FinanceLegacyRoute, got ${element}`);
      }
      if (!findHubLegacyTarget(hubs, path)) problems.push(`${path}: no hub tab has this legacyPath`);
    }
    expect(problems).toEqual([]);
  });

  it("keeps detail, create, print, cheque and requisition routes as their own pages", () => {
    const problems: string[] = [];
    for (const path of [...STANDALONE_ROUTES, CHEQUE_ROUTE]) {
      const element = routeElement(path);
      if (!element) problems.push(`${path}: no <Route>`);
      else if (element.includes("FinanceLegacyRoute") || element.includes("FinanceHubPage")) {
        problems.push(`${path}: must stay standalone, got ${element}`);
      }
      expect(findHubLegacyTarget(hubs, path), path).toBeNull();
    }
    expect(problems).toEqual([]);
  });

  it("maps every embeddable route to exactly one tab (Control Tower is the only new page)", () => {
    const legacy = hubs.flatMap((h) => h.tabs.map((t) => t.legacyPath));
    expect(new Set(legacy).size).toBe(legacy.length);
    const known = legacy.filter((p) => p !== "finance/home");
    expect(known.sort()).toEqual([...EMBEDDABLE_ROUTES].sort());
    expect(legacy).toContain("finance/home");
  });

  it("keeps Business Overview only in Loans & Facilities", () => {
    const owners = hubs.filter((h) => h.tabs.some((t) => t.legacyPath === "finance/business-overview"));
    expect(owners.map((h) => h.id)).toEqual(["facilities"]);
  });

  it("registers each hub route once with its own hub id; ids are unique", () => {
    expect(new Set(hubs.map((h) => h.id)).size).toBe(hubs.length);
    expect(new Set(hubs.map((h) => h.path)).size).toBe(hubs.length);
    for (const hub of hubs) {
      expect(routeElement(hub.path), hub.path).toBe(`<FinanceHubPage hubId="${hub.id}" />`);
      const ids = hub.tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("does not reuse a route that already exists for another page", () => {
    const hubPaths = new Set(hubs.map((h) => h.path));
    for (const path of [...EMBEDDABLE_ROUTES, ...STANDALONE_ROUTES, CHEQUE_ROUTE]) {
      expect(hubPaths.has(path), path).toBe(false);
    }
  });

  it("keeps the guards: Facilities hub under facility.access, every other Finance route under finance.access", () => {
    const finance = guardBlock("finance");
    const facility = guardBlock("facility");
    for (const hub of hubs) {
      const block = hub.id === "facilities" ? facility : finance;
      expect(block, hub.path).toContain(`path="${hub.path}"`);
      expect(hub.id === "facilities" ? finance : facility, hub.path).not.toContain(`path="${hub.path}"`);
      expect(hub.permissionKey).toBe(hub.id === "facilities" ? "facility.access" : "finance.access");
    }
    for (const tab of hubs.find((h) => h.id === "facilities")!.tabs) {
      expect(facility).toContain(`path="${tab.legacyPath}"`);
    }
    for (const hub of hubs.filter((h) => h.id !== "facilities")) {
      for (const tab of hub.tabs.filter((t) => t.legacyPath !== "finance/home")) {
        expect(finance, tab.legacyPath).toContain(`path="${tab.legacyPath}"`);
      }
    }
    // Procurement requisitions keep their finance guard.
    expect(finance).toContain('path="procurement/requisitions"');
    expect(finance).toContain('path="procurement/requisitions/:requisitionId"');
  });
});

describe("Finance sidebar", () => {
  const ctx = { tenantType: "both" as const, enabledOptionalProductionUnits: [], hasPermission: () => true };
  const financeLinks = (flags: Record<string, boolean | string>, hasPermission: (k: string) => boolean = () => true) => {
    const sections = filterVisibleMenuSections(menuSections, { ...ctx, featureFlags: flags, hasPermission });
    const finance = sections.find((s) => s.section === "Finance");
    return finance
      ? [...finance.items, ...(finance.subsections ?? []).flatMap((sub) => sub.items)].map((i) => i.href)
      : [];
  };
  const ALL_TAB_FLAGS = {
    gst_system_enabled: true,
    tds_system_enabled: true,
  };

  it("flag OFF keeps the current long Finance menu", () => {
    const original = menuSections.find((s) => s.section === "Finance")!;
    const originalHrefs = (original.subsections ?? []).flatMap((sub) => sub.items.map((i) => i.href));
    expect(originalHrefs).toHaveLength(56);
    const offFlags: Record<string, boolean | string>[] = [{}, { finance_hubs_v2: false }, { finance_hubs_v2: "true" }];
    for (const flags of offFlags) {
      const links = financeLinks(flags);
      expect(links).toContain("/app/accounts/vouchers");
      expect(links).toContain("/app/accounts/vouchers/print");
      expect(links.some((l) => l.includes("/finance/home"))).toBe(false);
    }
  });

  it("flag ON shows exactly the 10 hub links in the planned order", () => {
    const links = financeLinks({ finance_hubs_v2: true, ...ALL_TAB_FLAGS });
    expect(links).toEqual([
      "/app/finance/home",
      "/app/finance/vouchers-payables",
      "/app/finance/banking",
      "/app/finance/statements",
      "/app/finance/reports",
      "/app/finance/planning",
      "/app/finance/profitability",
      "/app/finance/tax-compliance",
      "/app/finance/facilities-hub",
      "/app/finance/setup",
    ]);
  });

  it("hides Tax & Compliance until GST or TDS is switched on", () => {
    expect(financeLinks({ finance_hubs_v2: true })).not.toContain("/app/finance/tax-compliance");
    expect(financeLinks({ finance_hubs_v2: true, gst_system_enabled: true })).toContain("/app/finance/tax-compliance");
  });

  it("filters hubs by permission while RBAC is enforced", () => {
    const flags = { finance_hubs_v2: true, rbac_enforcement: "enforce", ...ALL_TAB_FLAGS };
    const financeOnly = financeLinks(flags, (k) => k !== "facility.access");
    expect(financeOnly).toHaveLength(9);
    expect(financeOnly).not.toContain("/app/finance/facilities-hub");
    const facilityOnly = financeLinks(flags, (k) => k === "facility.access");
    expect(facilityOnly).toEqual(["/app/finance/facilities-hub"]);
    expect(financeLinks(flags, () => false)).toEqual([]);
  });
});

describe("Finance hub tabs", () => {
  const byId = (id: string) => hubs.find((h) => h.id === id)!;

  it("hides all five classic MIS tabs only when mis_reports_enabled is false", () => {
    const mis = [
      ["statements", "fund-flow"],
      ["reports", "mis"],
      ["reports", "mis-ratios"],
      ["reports", "comparative"],
      ["reports", "cash-scenarios"],
    ] as const;
    for (const [hubId, tabId] of mis) {
      const tab = byId(hubId).tabs.find((t) => t.id === tabId)!;
      expect(isHubTabVisible(tab, {}), tabId).toBe(true);
      expect(isHubTabVisible(tab, { mis_reports_enabled: true }), tabId).toBe(true);
      expect(isHubTabVisible(tab, { mis_reports_enabled: false }), tabId).toBe(false);
    }
  });

  it("shows optional voucher tabs only when their flag is exactly true", () => {
    const vp = byId("vouchers-payables");
    expect(visibleHubTabs(vp, {}).map((t) => t.id)).toEqual([
      "vouchers",
      "approvals",
      "outstanding-bills",
      "vendor-bills",
      "purchase-ap",
    ]);
    const all = visibleHubTabs(vp, {
      party_ledger_enabled: true,
      recurring_voucher_enabled: true,
      post_dated_voucher_enabled: true,
      memorandum_voucher_enabled: true,
    });
    expect(all).toHaveLength(9);
    expect(visibleHubTabs(vp, { party_ledger_enabled: "true" }).map((t) => t.id)).not.toContain("party-ledgers");
  });

  it("Finance Home keeps a landing page when the Control Tower flag is off", () => {
    const home = byId("home");
    expect(home.showWhenEmpty).toBe(true);
    expect(visibleHubTabs(home, {})).toEqual([]);
    expect(visibleHubTabs(home, { finance_control_tower_v2: true }).map((t) => t.id)).toEqual(["control-tower"]);
  });

  it("the Statements tabs use the report-view permission for navigation", () => {
    const keys = byId("statements").tabs.map((t) => t.permissionKey);
    expect(new Set(keys)).toEqual(new Set(["finance.mis_report.view"]));
    const tabs = visibleHubTabs(byId("statements"), {}, (k) => k !== "finance.mis_report.view");
    expect(tabs).toEqual([]);
  });

  it("only the flag value true switches the hubs on", () => {
    expect(isFinanceHubsV2Enabled({ finance_hubs_v2: true })).toBe(true);
    for (const flags of [undefined, null, {}, { finance_hubs_v2: false }, { finance_hubs_v2: "true" }, { finance_hubs_v2: 1 }]) {
      expect(isFinanceHubsV2Enabled(flags as never)).toBe(false);
    }
  });
});

describe("Finance palette and Help", () => {
  it("lists visible tabs in the command palette, including optional ones only when on", () => {
    const rows = financeTabPaletteRoutes({});
    expect(rows).toContainEqual(
      expect.objectContaining({ href: "/app/finance/banking?tab=reconciliation", label: "Reconciliation", section: "Finance · Banking" }),
    );
    expect(rows.some((r) => r.href.endsWith("tab=party-ledgers"))).toBe(false);
    expect(rows.some((r) => r.href.endsWith("tab=tax-ledgers"))).toBe(false);
    expect(financeTabPaletteRoutes({ gst_system_enabled: true }).some((r) => r.href.endsWith("tab=tax-ledgers"))).toBe(true);
    expect(financeTabPaletteRoutes({ mis_reports_enabled: false }).some((r) => r.href.endsWith("tab=mis"))).toBe(false);
  });

  it("does not list tabs of a hub the user may not open", () => {
    const facilityOnly = financeTabPaletteRoutes({}, (k) => k === "facility.access");
    expect(new Set(facilityOnly.map((r) => r.section))).toEqual(new Set(["Finance · Loans & Facilities"]));
  });

  it("resolves Help on a Finance hub to the open tab's old route", () => {
    expect(resolveFinanceHelpPath("/app/finance/banking", "?tab=payment-runs")).toBe("/app/banking/payment-runs");
    expect(resolveFinanceHelpPath("/app/finance/banking/", "")).toBe("/app/banking/accounts");
    expect(resolveFinanceHelpPath("/app/finance/banking", "?tab=nope")).toBe("/app/banking/accounts");
    expect(resolveFinanceHelpPath("/app/finance/setup", "?tab=chart-of-accounts")).toBe("/app/accounts");
    expect(resolveFinanceHelpPath("/app/accounts/vouchers", "")).toBe("/app/accounts/vouchers");
  });

  it("does not resolve Help to a tab that is switched off", () => {
    expect(resolveFinanceHelpPath("/app/finance/tax-compliance", "?tab=tds-reports", {})).toBe("/app/finance/tax-compliance");
    expect(resolveFinanceHelpPath("/app/finance/tax-compliance", "?tab=tds-reports", { tds_system_enabled: true })).toBe(
      "/app/finance/tds/reports",
    );
  });
});
