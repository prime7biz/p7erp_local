import { describe, expect, it } from "vitest";
import routerSource from "@/app/AppProtectedRouter.tsx?raw";
import { menuSections } from "@/app/sidebarConfig";
import { hubTabLabel, isHubTabVisible, visibleHubTabs } from "@/components/app/hubs/hubVisibility";
import type { Hub } from "@/components/app/hubs/types";
import { filterVisibleMenuSections } from "@/components/shell/sidebarNavUtils";
import {
  FINANCE_HUBS,
  isFinanceAiInsightsV2Enabled,
  isFinanceBudgetAnalyticsV2Enabled,
  isFinanceControlTowerV2Enabled,
  isFinanceHubsV2Enabled,
  isFinanceStatementsV2Enabled,
} from "./financeHubs";
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
  // Tally-style statements (tenant flag finance_statements_v2): direct routes that also are Statements hub tabs.
  "finance/statements/trial-balance",
  "finance/statements/balance-sheet",
  "finance/statements/profit-loss",
  "finance/statements/cash-flow",
  "finance/statements/funds-flow",
  "finance/statements/ratio-analysis",
  "finance/statements/stock-vs-ledger",
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
  // Budget analytics (tenant flag finance_budget_analytics_v2): direct routes that also are Budgets & Cash hub tabs.
  "finance/budget-analytics",
  "finance/expense-analysis",
  "finance/expense-controls",
  "finance/cash-forecast",
  "cashflow/calendar",
  "finance/style-profitability",
  "finance/lc-profitability",
  "finance/costing-variance",
  // GL profitability (tenant flag finance_control_tower_v2): direct routes that also are Profitability hub tabs.
  "finance/profitability/orders",
  "finance/profitability/entity",
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

  describe("Statements hub and finance_statements_v2", () => {
    const statements = () => byId("statements");
    const ids = (flags: Record<string, boolean | string>) => visibleHubTabs(statements(), flags).map((t) => t.id);
    const labels = (flags: Record<string, boolean | string>) =>
      visibleHubTabs(statements(), flags).map((t) => hubTabLabel(t, flags));

    it("flag OFF keeps exactly the five Phase 1 tabs with their old names", () => {
      for (const flags of [{}, { finance_statements_v2: false }, { finance_statements_v2: "true" }, { finance_statements_v2: 1 }]) {
        expect(ids(flags as never)).toEqual(["trial-balance", "financial-statements", "cash-flow", "fund-flow", "ratio-analysis"]);
        expect(labels(flags as never)).toEqual(["Trial Balance", "Financial Statements", "Cash Flow", "Funds Flow", "Ratio Analysis"]);
      }
    });

    it("flag ON lists the seven new statements first, then the five classic ones labelled (Classic)", () => {
      const on = { finance_statements_v2: true };
      expect(ids(on)).toEqual([
        "statement-trial-balance",
        "statement-balance-sheet",
        "statement-profit-loss",
        "statement-cash-flow",
        "statement-funds-flow",
        "statement-ratio-analysis",
        "statement-stock-ledger",
        "trial-balance",
        "financial-statements",
        "cash-flow",
        "fund-flow",
        "ratio-analysis",
      ]);
      expect(labels(on)).toEqual([
        "Trial Balance",
        "Balance Sheet",
        "Profit & Loss",
        "Cash Flow",
        "Funds Flow",
        "Ratio Analysis",
        "Stock vs Ledger",
        "Trial Balance (Classic)",
        "Financial Statements (Classic)",
        "Cash Flow (Classic)",
        "Funds Flow (Classic)",
        "Ratio Analysis (Classic)",
      ]);
    });

    it("keeps the classic old routes pointing at their own tabs while the flag is on", () => {
      const target = (path: string) => findHubLegacyTarget(hubs, path)?.tab.id;
      expect(target("accounts/reports/trial-balance")).toBe("trial-balance");
      expect(target("accounts/reports/financial-statements")).toBe("financial-statements");
      expect(target("accounts/reports/cash-flow")).toBe("cash-flow");
      expect(target("finance/mis/fund-flow")).toBe("fund-flow");
      expect(target("accounts/reports/ratio-analysis")).toBe("ratio-analysis");
      expect(target("finance/statements/profit-loss")).toBe("statement-profit-loss");
    });

    it("hides every tab for a user without the report-view permission and still shows the classic ones with it", () => {
      const on = { finance_statements_v2: true };
      expect(visibleHubTabs(statements(), on, (k) => k !== "finance.mis_report.view")).toEqual([]);
      expect(visibleHubTabs(statements(), on, () => true)).toHaveLength(12);
    });

    it("only the exact value true counts as on", () => {
      expect(isFinanceStatementsV2Enabled({ finance_statements_v2: true })).toBe(true);
      for (const flags of [undefined, null, {}, { finance_statements_v2: false }, { finance_statements_v2: "true" }]) {
        expect(isFinanceStatementsV2Enabled(flags as never)).toBe(false);
      }
    });

    it("palette rows and Help follow the flag", () => {
      const off = financeTabPaletteRoutes({}).filter((r) => r.section === "Finance · Statements").map((r) => r.label);
      expect(off).toEqual(["Trial Balance", "Financial Statements", "Cash Flow", "Funds Flow", "Ratio Analysis"]);
      const on = financeTabPaletteRoutes({ finance_statements_v2: true }).filter((r) => r.section === "Finance · Statements");
      expect(on.map((r) => r.label)).toContain("Trial Balance (Classic)");
      expect(on.map((r) => r.href)).toContain("/app/finance/statements?tab=statement-balance-sheet");
      expect(resolveFinanceHelpPath("/app/finance/statements", "?tab=statement-profit-loss", { finance_statements_v2: true })).toBe(
        "/app/finance/statements/profit-loss",
      );
      // Flag off: a new tab is not available, Help falls back to the first classic tab.
      expect(resolveFinanceHelpPath("/app/finance/statements", "?tab=statement-profit-loss", {})).toBe("/app/accounts/reports/trial-balance");
    });
  });

  describe("Profitability hub and finance_control_tower_v2", () => {
    const profitability = () => byId("profitability");
    const ids = (flags: Record<string, boolean | string>) => visibleHubTabs(profitability(), flags).map((t) => t.id);
    const labels = (flags: Record<string, boolean | string>) =>
      visibleHubTabs(profitability(), flags).map((t) => hubTabLabel(t, flags));

    it("flag OFF keeps exactly the three quotation tabs with their old names", () => {
      for (const flags of [{}, { finance_control_tower_v2: false }, { finance_control_tower_v2: "true" }, { finance_control_tower_v2: 1 }]) {
        expect(ids(flags as never)).toEqual(["style", "lc", "variance"]);
        expect(labels(flags as never)).toEqual(["Style Profitability", "LC Profitability", "Costing Variance"]);
      }
    });

    it("flag ON lists the two GL tabs first and labels the quotation tabs (Quotation)", () => {
      const on = { finance_control_tower_v2: true };
      expect(ids(on)).toEqual(["order-pnl-gl", "entity-pnl-gl", "style", "lc", "variance"]);
      expect(labels(on)).toEqual([
        "Order P&L (GL)",
        "Style / LC / Buyer P&L (GL)",
        "Style Profitability (Quotation)",
        "LC Profitability (Quotation)",
        "Costing Variance (Quotation)",
      ]);
    });

    it("keeps the quotation routes on their own tabs while the flag is on", () => {
      const target = (path: string) => findHubLegacyTarget(hubs, path)?.tab.id;
      expect(target("finance/style-profitability")).toBe("style");
      expect(target("finance/lc-profitability")).toBe("lc");
      expect(target("finance/costing-variance")).toBe("variance");
      expect(target("finance/profitability/orders")).toBe("order-pnl-gl");
      expect(target("finance/profitability/entity")).toBe("entity-pnl-gl");
    });

    it("GL tabs need the report-view permission for navigation; quotation tabs are unchanged", () => {
      const on = { finance_control_tower_v2: true };
      const noMis = (k: string) => k !== "finance.mis_report.view";
      expect(visibleHubTabs(profitability(), on, noMis).map((t) => t.id)).toEqual(["style", "lc", "variance"]);
    });

    it("Finance Home shows the Control Tower tab only for an exact true flag", () => {
      const home = byId("home");
      expect(visibleHubTabs(home, { finance_control_tower_v2: "true" } as never)).toEqual([]);
      expect(visibleHubTabs(home, { finance_control_tower_v2: true }).map((t) => t.id)).toEqual(["control-tower"]);
    });

    it("only the exact value true counts as on", () => {
      expect(isFinanceControlTowerV2Enabled({ finance_control_tower_v2: true })).toBe(true);
      for (const flags of [undefined, null, {}, { finance_control_tower_v2: false }, { finance_control_tower_v2: "true" }]) {
        expect(isFinanceControlTowerV2Enabled(flags as never)).toBe(false);
      }
    });
  });

  describe("Budgets & Cash hub and finance_budget_analytics_v2", () => {
    const planning = () => byId("planning");
    type Flags = Record<string, boolean | string | number>;
    const ids = (flags: Flags) => visibleHubTabs(planning(), flags).map((t) => t.id);
    const labels = (flags: Flags) => visibleHubTabs(planning(), flags).map((t) => hubTabLabel(t, flags));

    it("flag OFF keeps exactly the three existing tabs with their old names", () => {
      const offFlags: Flags[] = [{}, { finance_budget_analytics_v2: false }, { finance_budget_analytics_v2: "true" }, { finance_budget_analytics_v2: 1 }];
      for (const flags of offFlags) {
        expect(ids(flags)).toEqual(["budgets", "cash-forecast", "cashflow-calendar"]);
        expect(labels(flags)).toEqual(["Budgets", "Cash Forecast", "Cashflow Calendar"]);
      }
    });

    it("flag ON lists the three analytics tabs first; the existing tabs are unchanged", () => {
      const on = { finance_budget_analytics_v2: true };
      expect(ids(on)).toEqual(["budget-analytics", "expense-analysis", "expense-controls", "budgets", "cash-forecast", "cashflow-calendar"]);
      expect(labels(on)).toEqual([
        "Budget vs Actual (analytics)",
        "Expense analysis",
        "Expense controls",
        "Budgets",
        "Cash Forecast",
        "Cashflow Calendar",
      ]);
    });

    it("the analytics tabs need the report-view permission; the existing tabs do not", () => {
      const on = { finance_budget_analytics_v2: true };
      expect(visibleHubTabs(planning(), on, (k) => k !== "finance.mis_report.view").map((t) => t.id)).toEqual([
        "budgets",
        "cash-forecast",
        "cashflow-calendar",
      ]);
    });

    it("the direct routes point at their own tabs", () => {
      const target = (path: string) => findHubLegacyTarget(hubs, path)?.tab.id;
      expect(target("finance/budget-analytics")).toBe("budget-analytics");
      expect(target("finance/expense-analysis")).toBe("expense-analysis");
      expect(target("finance/expense-controls")).toBe("expense-controls");
      expect(target("accounts/budgets")).toBe("budgets");
    });

    it("palette rows follow the flag", () => {
      const tabRows = (flags: Record<string, boolean>) =>
        financeTabPaletteRoutes(flags).filter((r) => r.section === "Finance · Budgets & Cash").map((r) => r.href);
      expect(tabRows({})).not.toContain("/app/finance/planning?tab=budget-analytics");
      expect(tabRows({ finance_budget_analytics_v2: true })).toContain("/app/finance/planning?tab=budget-analytics");
    });

    it("only the exact value true counts as on (budget analytics and finance AI)", () => {
      expect(isFinanceBudgetAnalyticsV2Enabled({ finance_budget_analytics_v2: true })).toBe(true);
      expect(isFinanceAiInsightsV2Enabled({ finance_ai_insights_v2: true })).toBe(true);
      for (const flags of [undefined, null, {}, { finance_budget_analytics_v2: false }, { finance_budget_analytics_v2: "true" }]) {
        expect(isFinanceBudgetAnalyticsV2Enabled(flags as never)).toBe(false);
      }
      for (const flags of [undefined, null, {}, { finance_ai_insights_v2: false }, { finance_ai_insights_v2: "true" }]) {
        expect(isFinanceAiInsightsV2Enabled(flags as never)).toBe(false);
      }
    });
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
