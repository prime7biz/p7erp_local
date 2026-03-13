const prefetchedKeys = new Set<string>();

type PrefetchRule = {
  key: string;
  matches: (href: string) => boolean;
  load: () => Promise<unknown>;
};

const prefetchRules: PrefetchRule[] = [
  {
    key: "vouchers",
    matches: (href) => href.startsWith("/app/accounts/vouchers"),
    load: () => import("@/pages/app/VouchersPage"),
  },
  {
    key: "inventory-reconciliation",
    matches: (href) => href.startsWith("/app/inventory/reconciliation"),
    load: () => import("@/pages/app/InventoryReconciliationPage"),
  },
  {
    key: "bank-reconciliation",
    matches: (href) => href.startsWith("/app/banking/reconciliation"),
    load: () => import("@/pages/app/BankReconciliationPage"),
  },
  {
    key: "payment-runs",
    matches: (href) => href.startsWith("/app/banking/payment-runs"),
    load: () => import("@/pages/app/PaymentRunsPage"),
  },
  {
    key: "hr-module",
    matches: (href) => href.startsWith("/app/hr/"),
    load: () => import("@/pages/app/hr/HrEmployeesPage"),
  },
  {
    key: "manufacturing-module",
    matches: (href) =>
      href.startsWith("/app/production/") ||
      href.startsWith("/app/quality/") ||
      href.startsWith("/app/tna/") ||
      href.startsWith("/app/samples/"),
    load: () => import("@/pages/app/manufacturing/ProductionOverviewPage"),
  },
  {
    key: "reports-module",
    matches: (href) => href.startsWith("/app/reports/"),
    load: () => import("@/pages/app/ReportsOverviewPage"),
  },
  {
    key: "settings-shell",
    matches: (href) => href.startsWith("/app/settings"),
    load: () => import("@/pages/settings/SettingsLayout"),
  },
];

export function prefetchSidebarRoute(href: string) {
  for (const rule of prefetchRules) {
    if (!rule.matches(href) || prefetchedKeys.has(rule.key)) continue;
    prefetchedKeys.add(rule.key);
    void rule.load();
    return;
  }
}

export function prefetchTopSearchRoutes() {
  const searchPrefetchKeys = ["vouchers", "inventory-reconciliation", "bank-reconciliation", "hr-module", "reports-module"];

  for (const key of searchPrefetchKeys) {
    if (prefetchedKeys.has(key)) continue;
    const rule = prefetchRules.find((r) => r.key === key);
    if (!rule) continue;
    prefetchedKeys.add(rule.key);
    void rule.load();
  }
}
