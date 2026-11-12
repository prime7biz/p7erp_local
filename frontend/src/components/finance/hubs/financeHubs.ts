/**
 * Finance hubs (tenant flag `finance_hubs_v2`, default OFF): one sidebar link per hub, each hub
 * shows existing pages as URL tabs (`?tab=`). Single source of truth for the hub routes, the
 * redirects from old pages (`legacyPath`), the sidebar links, the Ctrl+K rows and Help lookup.
 * The tab map follows docs/finance-modernization/PLAN.md section 2.
 */
import { createElement, type ComponentType } from "react";
import {
  BarChart3,
  Banknote,
  CreditCard,
  FileBarChart,
  Landmark,
  LayoutDashboard,
  Percent,
  Settings2,
  Target,
  TrendingUp,
} from "lucide-react";
import type { Hub, HubPageModule } from "@/components/app/hubs/types";

export const FINANCE_HUBS_FLAG = "finance_hubs_v2";

type FeatureFlags = Record<string, boolean | string | number | null> | null | undefined;

/** True only for an explicit `true` (default OFF). */
export function isFinanceHubsV2Enabled(featureFlags: FeatureFlags): boolean {
  return featureFlags?.[FINANCE_HUBS_FLAG] === true;
}

/** Tally-style statements (Finance modernization Phase 2), default OFF, strict true. */
export const FINANCE_STATEMENTS_FLAG = "finance_statements_v2";

/** True only for an explicit `true` (default OFF). */
export function isFinanceStatementsV2Enabled(featureFlags: FeatureFlags): boolean {
  return featureFlags?.[FINANCE_STATEMENTS_FLAG] === true;
}

/** Profitability pages share one component with a start mode. */
function profitabilityPage(defaultMode: "style" | "lc" | "variance"): () => HubPageModule {
  return () =>
    import("@/pages/app/ProfitabilityPage").then((m) => {
      const Page: ComponentType = () => createElement(m.ProfitabilityPage, { defaultMode });
      return { default: Page };
    });
}

/* Lazy page loaders (named exports → default for React.lazy). */
const pages = {
  controlTower: () =>
    import("@/pages/app/finance/FinanceControlTowerPage").then((m) => ({ default: m.FinanceControlTowerPage })),
  vouchers: () => import("@/pages/app/VouchersPage").then((m) => ({ default: m.VouchersPage })),
  voucherApprovals: () => import("@/pages/app/VoucherApprovalsPage").then((m) => ({ default: m.VoucherApprovalsPage })),
  outstandingBills: () => import("@/pages/app/OutstandingBillsPage").then((m) => ({ default: m.OutstandingBillsPage })),
  vendorBills: () => import("@/pages/app/accounts/VendorBillsPage").then((m) => ({ default: m.VendorBillsPage })),
  purchaseWorkflow: () => import("@/pages/app/PurchaseWorkflowPage").then((m) => ({ default: m.PurchaseWorkflowPage })),
  partyLedgers: () =>
    import("@/pages/app/finance/party-ledger/PartyLedgersPage").then((m) => ({ default: m.PartyLedgersPage })),
  recurringVouchers: () =>
    import("@/pages/app/finance/advanced-vouchers/RecurringVouchersPage").then((m) => ({
      default: m.RecurringVouchersPage,
    })),
  postDated: () =>
    import("@/pages/app/finance/advanced-vouchers/PostDatedRegisterPage").then((m) => ({
      default: m.PostDatedRegisterPage,
    })),
  memorandum: () =>
    import("@/pages/app/finance/advanced-vouchers/MemorandumRegisterPage").then((m) => ({
      default: m.MemorandumRegisterPage,
    })),
  bankAccounts: () => import("@/pages/app/BankAccountsPage").then((m) => ({ default: m.BankAccountsPage })),
  bankReconciliation: () =>
    import("@/pages/app/BankReconciliationPage").then((m) => ({ default: m.BankReconciliationPage })),
  paymentRuns: () => import("@/pages/app/PaymentRunsPage").then((m) => ({ default: m.PaymentRunsPage })),
  paymentAdvice: () => import("@/pages/app/PaymentAdvicePage").then((m) => ({ default: m.PaymentAdvicePage })),
  settlementAudit: () => import("@/pages/app/SettlementAuditPage").then((m) => ({ default: m.SettlementAuditPage })),
  fxReceipts: () => import("@/pages/app/FxReceiptsPage").then((m) => ({ default: m.FxReceiptsPage })),
  stmtTrialBalance: () =>
    import("@/pages/app/finance/statements/TrialBalanceStatementPage").then((m) => ({
      default: m.TrialBalanceStatementPage,
    })),
  stmtBalanceSheet: () =>
    import("@/pages/app/finance/statements/BalanceSheetStatementPage").then((m) => ({
      default: m.BalanceSheetStatementPage,
    })),
  stmtProfitLoss: () =>
    import("@/pages/app/finance/statements/ProfitLossStatementPage").then((m) => ({
      default: m.ProfitLossStatementPage,
    })),
  stmtCashFlow: () =>
    import("@/pages/app/finance/statements/CashFlowMonthlyPage").then((m) => ({ default: m.CashFlowMonthlyPage })),
  stmtFundsFlow: () =>
    import("@/pages/app/finance/statements/FundsFlowMonthlyPage").then((m) => ({ default: m.FundsFlowMonthlyPage })),
  stmtRatioAnalysis: () =>
    import("@/pages/app/finance/statements/RatioAnalysisStatementPage").then((m) => ({
      default: m.RatioAnalysisStatementPage,
    })),
  stmtStockLedger: () =>
    import("@/pages/app/finance/statements/StockGlReconciliationPage").then((m) => ({
      default: m.StockGlReconciliationPage,
    })),
  trialBalance: () => import("@/pages/app/TrialBalancePage").then((m) => ({ default: m.TrialBalancePage })),
  financialStatements: () =>
    import("@/pages/app/FinancialStatementsPage").then((m) => ({ default: m.FinancialStatementsPage })),
  cashFlow: () => import("@/pages/app/CashFlowReportPage").then((m) => ({ default: m.CashFlowReportPage })),
  fundFlow: () => import("@/pages/app/finance/mis/FundFlowPage").then((m) => ({ default: m.FundFlowPage })),
  ratioAnalysis: () => import("@/pages/app/RatioAnalysisPage").then((m) => ({ default: m.RatioAnalysisPage })),
  dayBook: () => import("@/pages/app/DayBookPage").then((m) => ({ default: m.DayBookPage })),
  arApAging: () => import("@/pages/app/ArApAgingReportPage").then((m) => ({ default: m.ArApAgingReportPage })),
  ledgerActivity: () => import("@/pages/app/LedgerActivityPage").then((m) => ({ default: m.LedgerActivityPage })),
  exceptions: () =>
    import("@/pages/app/finance/ExceptionReportsPage").then((m) => ({ default: m.ExceptionReportsPage })),
  voucherAnalytics: () => import("@/pages/app/VoucherAnalyticsPage").then((m) => ({ default: m.VoucherAnalyticsPage })),
  groupSummary: () => import("@/pages/app/GroupSummaryPage").then((m) => ({ default: m.GroupSummaryPage })),
  misDashboard: () =>
    import("@/pages/app/finance/mis/FinancialDashboardPage").then((m) => ({ default: m.FinancialDashboardPage })),
  misRatios: () =>
    import("@/pages/app/finance/mis/RatioAnalysisMisPage").then((m) => ({ default: m.RatioAnalysisMisPage })),
  misComparative: () =>
    import("@/pages/app/finance/mis/ComparativeStatementsPage").then((m) => ({
      default: m.ComparativeStatementsPage,
    })),
  misCashScenarios: () =>
    import("@/pages/app/finance/mis/CashFlowScenarioPage").then((m) => ({ default: m.CashFlowScenarioPage })),
  budgets: () => import("@/pages/app/BudgetsPage").then((m) => ({ default: m.BudgetsPage })),
  cashForecast: () => import("@/pages/app/CashForecastPage").then((m) => ({ default: m.CashForecastPage })),
  cashflowCalendar: () => import("@/pages/app/CashflowCalendarPage").then((m) => ({ default: m.CashflowCalendarPage })),
  styleProfitability: profitabilityPage("style"),
  lcProfitability: profitabilityPage("lc"),
  costingVariance: profitabilityPage("variance"),
  taxLedgers: () => import("@/pages/app/finance/gst/TaxLedgersPage").then((m) => ({ default: m.TaxLedgersPage })),
  gstReturns: () => import("@/pages/app/finance/gst/GstReturnsPage").then((m) => ({ default: m.GstReturnsPage })),
  taxSettings: () => import("@/pages/app/finance/gst/TaxSettingsPage").then((m) => ({ default: m.TaxSettingsPage })),
  tdsSettings: () => import("@/pages/app/finance/tds/TdsSettingsPage").then((m) => ({ default: m.TdsSettingsPage })),
  tdsReports: () => import("@/pages/app/finance/tds/TdsReportsPage").then((m) => ({ default: m.TdsReportsPage })),
  facilityDashboard: () =>
    import("@/pages/app/finance/FacilityDashboardPage").then((m) => ({ default: m.FacilityDashboardPage })),
  facilities: () => import("@/pages/app/finance/FacilitiesPage").then((m) => ({ default: m.FacilitiesPage })),
  businessOverview: () =>
    import("@/pages/app/finance/BusinessOverviewPage").then((m) => ({ default: m.BusinessOverviewPage })),
  advanceOptions: () => import("@/pages/app/AdvanceOptionsPage").then((m) => ({ default: m.AdvanceOptionsPage })),
  accountGroups: () => import("@/pages/app/AccountGroupsPage").then((m) => ({ default: m.AccountGroupsPage })),
  chartOfAccounts: () => import("@/pages/app/ChartOfAccountsPage").then((m) => ({ default: m.ChartOfAccountsPage })),
  costCenters: () => import("@/pages/app/CostCentersPage").then((m) => ({ default: m.CostCentersPage })),
  currency: () => import("@/pages/app/AccountsCurrencyPage").then((m) => ({ default: m.AccountsCurrencyPage })),
  accountingPeriods: () =>
    import("@/pages/app/AccountingPeriodsPage").then((m) => ({ default: m.AccountingPeriodsPage })),
  voucherTypes: () =>
    import("@/pages/app/finance/advanced-vouchers/VoucherTypeConfigPage").then((m) => ({
      default: m.VoucherTypeConfigPage,
    })),
  voucherClasses: () =>
    import("@/pages/app/finance/advanced-vouchers/VoucherClassPage").then((m) => ({ default: m.VoucherClassPage })),
} satisfies Record<string, () => HubPageModule>;

const MIS_FLAG = "mis_reports_enabled";
const STATEMENTS_FLAG = FINANCE_STATEMENTS_FLAG;
const MIS_VIEW = "finance.mis_report.view";

export const FINANCE_HUBS = [
  {
    id: "home",
    path: "finance/home",
    label: "Finance Home",
    description: "Your starting point for accounts, banking, statements and reports.",
    icon: LayoutDashboard,
    permissionKey: "finance.access",
    // The Control Tower is built in a later phase; until then Finance Home shows a card grid.
    showWhenEmpty: true,
    tabs: [
      {
        id: "control-tower",
        label: "Control Tower",
        legacyPath: "finance/home",
        load: pages.controlTower,
        requiresFeatureFlag: "finance_control_tower_v2",
        permissionKey: "finance.access",
      },
    ],
  },
  {
    id: "vouchers-payables",
    path: "finance/vouchers-payables",
    label: "Vouchers & Payables",
    description: "Vouchers and approvals, bills to pay, vendor bills and the voucher registers.",
    icon: CreditCard,
    permissionKey: "finance.access",
    tabs: [
      { id: "vouchers", label: "Vouchers", legacyPath: "accounts/vouchers", load: pages.vouchers },
      { id: "approvals", label: "Approvals", legacyPath: "accounts/vouchers/approval-queue", load: pages.voucherApprovals },
      { id: "outstanding-bills", label: "Outstanding Bills", legacyPath: "accounts/outstanding-bills", load: pages.outstandingBills },
      { id: "vendor-bills", label: "Vendor Bills (GRN)", legacyPath: "accounts/vendor-bills", load: pages.vendorBills },
      { id: "purchase-ap", label: "Purchase & AP", legacyPath: "accounts/purchase-workflow", load: pages.purchaseWorkflow },
      {
        id: "party-ledgers",
        label: "Party Ledgers",
        legacyPath: "finance/party-ledgers",
        load: pages.partyLedgers,
        requiresFeatureFlag: "party_ledger_enabled",
      },
      {
        id: "recurring",
        label: "Recurring Vouchers",
        legacyPath: "finance/recurring-vouchers",
        load: pages.recurringVouchers,
        requiresFeatureFlag: "recurring_voucher_enabled",
      },
      {
        id: "post-dated",
        label: "Post-dated Register",
        legacyPath: "finance/registers/post-dated",
        load: pages.postDated,
        requiresFeatureFlag: "post_dated_voucher_enabled",
      },
      {
        id: "memorandum",
        label: "Memorandum Register",
        legacyPath: "finance/registers/memorandum",
        load: pages.memorandum,
        requiresFeatureFlag: "memorandum_voucher_enabled",
      },
    ],
  },
  {
    id: "banking",
    path: "finance/banking",
    label: "Banking",
    description: "Bank accounts, reconciliation, payment runs, payment advice and FX receipts.",
    icon: Landmark,
    permissionKey: "finance.access",
    tabs: [
      { id: "accounts", label: "Bank Accounts", legacyPath: "banking/accounts", load: pages.bankAccounts },
      { id: "reconciliation", label: "Reconciliation", legacyPath: "banking/reconciliation", load: pages.bankReconciliation },
      { id: "payment-runs", label: "Payment Runs", legacyPath: "banking/payment-runs", load: pages.paymentRuns },
      { id: "payment-advice", label: "Payment Advice", legacyPath: "banking/payment-advice", load: pages.paymentAdvice },
      { id: "settlement-audit", label: "Settlement Audit", legacyPath: "banking/settlement-audit", load: pages.settlementAudit },
      { id: "fx-receipts", label: "FX Receipts", legacyPath: "finance/fx-receipts", load: pages.fxReceipts },
    ],
  },
  {
    id: "statements",
    path: "finance/statements",
    label: "Statements",
    description: "Trial balance, financial statements, cash flow, funds flow and ratios.",
    icon: FileBarChart,
    permissionKey: "finance.access",
    tabs: [
      // New Tally-style statements: shown only while `finance_statements_v2` is true, listed first.
      // Their `legacyPath` is the direct route of the page (it redirects to the tab when the hubs are on).
      {
        id: "statement-trial-balance",
        label: "Trial Balance",
        legacyPath: "finance/statements/trial-balance",
        load: pages.stmtTrialBalance,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "statement-balance-sheet",
        label: "Balance Sheet",
        legacyPath: "finance/statements/balance-sheet",
        load: pages.stmtBalanceSheet,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "statement-profit-loss",
        label: "Profit & Loss",
        legacyPath: "finance/statements/profit-loss",
        load: pages.stmtProfitLoss,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "statement-cash-flow",
        label: "Cash Flow",
        legacyPath: "finance/statements/cash-flow",
        load: pages.stmtCashFlow,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "statement-funds-flow",
        label: "Funds Flow",
        legacyPath: "finance/statements/funds-flow",
        load: pages.stmtFundsFlow,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "statement-ratio-analysis",
        label: "Ratio Analysis",
        legacyPath: "finance/statements/ratio-analysis",
        load: pages.stmtRatioAnalysis,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "statement-stock-ledger",
        label: "Stock vs Ledger",
        legacyPath: "finance/statements/stock-vs-ledger",
        load: pages.stmtStockLedger,
        requiresFeatureFlag: STATEMENTS_FLAG,
        permissionKey: MIS_VIEW,
      },
      // Classic reports: always available; they get a "(Classic)" label while the new statements are on.
      {
        id: "trial-balance",
        label: "Trial Balance",
        labelWhenFlagOn: { flag: STATEMENTS_FLAG, label: "Trial Balance (Classic)" },
        legacyPath: "accounts/reports/trial-balance",
        load: pages.trialBalance,
        permissionKey: MIS_VIEW,
      },
      {
        id: "financial-statements",
        label: "Financial Statements",
        labelWhenFlagOn: { flag: STATEMENTS_FLAG, label: "Financial Statements (Classic)" },
        legacyPath: "accounts/reports/financial-statements",
        load: pages.financialStatements,
        permissionKey: MIS_VIEW,
      },
      {
        id: "cash-flow",
        label: "Cash Flow",
        labelWhenFlagOn: { flag: STATEMENTS_FLAG, label: "Cash Flow (Classic)" },
        legacyPath: "accounts/reports/cash-flow",
        load: pages.cashFlow,
        permissionKey: MIS_VIEW,
      },
      {
        id: "fund-flow",
        label: "Funds Flow",
        labelWhenFlagOn: { flag: STATEMENTS_FLAG, label: "Funds Flow (Classic)" },
        legacyPath: "finance/mis/fund-flow",
        load: pages.fundFlow,
        hideWhenFeatureFlagFalse: MIS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "ratio-analysis",
        label: "Ratio Analysis",
        labelWhenFlagOn: { flag: STATEMENTS_FLAG, label: "Ratio Analysis (Classic)" },
        legacyPath: "accounts/reports/ratio-analysis",
        load: pages.ratioAnalysis,
        permissionKey: MIS_VIEW,
      },
    ],
  },
  {
    id: "reports",
    path: "finance/reports",
    label: "Reports & MIS",
    description: "Day book, aging, ledger activity, exceptions and the Financial MIS reports.",
    icon: BarChart3,
    permissionKey: "finance.access",
    tabs: [
      { id: "day-book", label: "Day Book", legacyPath: "accounts/reports/day-book", load: pages.dayBook },
      { id: "ar-ap-aging", label: "AR/AP Aging", legacyPath: "accounts/reports/ar-ap-aging", load: pages.arApAging },
      { id: "ledger-activity", label: "Ledger Activity", legacyPath: "accounts/reports/ledger-activity", load: pages.ledgerActivity },
      { id: "exceptions", label: "Exceptions", legacyPath: "accounts/reports/exceptions", load: pages.exceptions },
      { id: "voucher-analytics", label: "Voucher Analytics", legacyPath: "accounts/reports/voucher-analytics", load: pages.voucherAnalytics },
      { id: "group-summary", label: "Group Summary", legacyPath: "accounts/reports/group-summary", load: pages.groupSummary },
      {
        id: "mis",
        label: "Financial MIS",
        legacyPath: "finance/mis",
        load: pages.misDashboard,
        hideWhenFeatureFlagFalse: MIS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "mis-ratios",
        label: "MIS Ratios (classic)",
        legacyPath: "finance/mis/ratios",
        load: pages.misRatios,
        hideWhenFeatureFlagFalse: MIS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "comparative",
        label: "Comparative",
        legacyPath: "finance/mis/comparative",
        load: pages.misComparative,
        hideWhenFeatureFlagFalse: MIS_FLAG,
        permissionKey: MIS_VIEW,
      },
      {
        id: "cash-scenarios",
        label: "Cash Scenarios",
        legacyPath: "finance/mis/cash-scenarios",
        load: pages.misCashScenarios,
        hideWhenFeatureFlagFalse: MIS_FLAG,
        permissionKey: "finance.scenario_analysis.view",
      },
    ],
  },
  {
    id: "planning",
    path: "finance/planning",
    label: "Budgets & Cash",
    description: "Budgets, the cash forecast and the cashflow calendar.",
    icon: TrendingUp,
    permissionKey: "finance.access",
    tabs: [
      { id: "budgets", label: "Budgets", legacyPath: "accounts/budgets", load: pages.budgets },
      { id: "cash-forecast", label: "Cash Forecast", legacyPath: "finance/cash-forecast", load: pages.cashForecast },
      { id: "cashflow-calendar", label: "Cashflow Calendar", legacyPath: "cashflow/calendar", load: pages.cashflowCalendar },
    ],
  },
  {
    id: "profitability",
    path: "finance/profitability",
    label: "Profitability",
    description: "Profit by style and by LC, and costing variance.",
    icon: Target,
    permissionKey: "finance.access",
    tabs: [
      { id: "style", label: "Style Profitability", legacyPath: "finance/style-profitability", load: pages.styleProfitability },
      { id: "lc", label: "LC Profitability", legacyPath: "finance/lc-profitability", load: pages.lcProfitability },
      { id: "variance", label: "Costing Variance", legacyPath: "finance/costing-variance", load: pages.costingVariance },
    ],
  },
  {
    id: "tax-compliance",
    path: "finance/tax-compliance",
    label: "Tax & Compliance",
    description: "Tax ledgers, GST returns and settings, TDS settings and reports.",
    icon: Percent,
    permissionKey: "finance.access",
    tabs: [
      {
        id: "tax-ledgers",
        label: "Tax Ledgers",
        legacyPath: "finance/tax-ledgers",
        load: pages.taxLedgers,
        requiresFeatureFlag: "gst_system_enabled",
      },
      {
        id: "gst-returns",
        label: "GST Returns",
        legacyPath: "finance/gst/returns",
        load: pages.gstReturns,
        requiresFeatureFlag: "gst_system_enabled",
      },
      {
        id: "tax-settings",
        label: "Tax Settings",
        legacyPath: "finance/gst/settings",
        load: pages.taxSettings,
        requiresFeatureFlag: "gst_system_enabled",
      },
      {
        id: "tds-settings",
        label: "TDS Settings",
        legacyPath: "finance/tds",
        load: pages.tdsSettings,
        requiresFeatureFlag: "tds_system_enabled",
      },
      {
        id: "tds-reports",
        label: "TDS Reports",
        legacyPath: "finance/tds/reports",
        load: pages.tdsReports,
        requiresFeatureFlag: "tds_system_enabled",
      },
    ],
  },
  {
    id: "facilities",
    path: "finance/facilities-hub",
    label: "Loans & Facilities",
    description: "Bank facilities, utilizations and the business overview.",
    icon: Banknote,
    permissionKey: "facility.access",
    tabs: [
      {
        id: "dashboard",
        label: "Dashboard",
        legacyPath: "finance/facilities/dashboard",
        load: pages.facilityDashboard,
        permissionKey: "facility.access",
      },
      {
        id: "all",
        label: "All Facilities",
        legacyPath: "finance/facilities",
        load: pages.facilities,
        permissionKey: "facility.access",
      },
      {
        id: "business-overview",
        label: "Business Overview",
        legacyPath: "finance/business-overview",
        load: pages.businessOverview,
        permissionKey: "facility.access",
      },
    ],
  },
  {
    id: "setup",
    path: "finance/setup",
    label: "Finance Setup",
    description: "Chart of accounts, groups, cost centres, currencies, periods and voucher types.",
    icon: Settings2,
    permissionKey: "finance.access",
    tabs: [
      { id: "advance-options", label: "Advance Options", legacyPath: "accounts/advance-options", load: pages.advanceOptions },
      { id: "account-groups", label: "Account Groups", legacyPath: "accounts/groups", load: pages.accountGroups },
      { id: "chart-of-accounts", label: "Chart of Accounts", legacyPath: "accounts", load: pages.chartOfAccounts },
      { id: "cost-centers", label: "Cost Centres", legacyPath: "accounts/cost-centers", load: pages.costCenters },
      { id: "currency", label: "Multi-Currency", legacyPath: "accounts/currency", load: pages.currency },
      { id: "accounting-periods", label: "Accounting Periods", legacyPath: "accounts/accounting-periods", load: pages.accountingPeriods },
      { id: "voucher-types", label: "Voucher Types", legacyPath: "finance/voucher-types", load: pages.voucherTypes },
      {
        id: "voucher-classes",
        label: "Voucher Classes",
        legacyPath: "finance/voucher-classes",
        load: pages.voucherClasses,
        requiresFeatureFlag: "voucher_class_enabled",
      },
    ],
  },
] as const satisfies readonly Hub[];

export type FinanceHubId = (typeof FINANCE_HUBS)[number]["id"];

const hubs: readonly Hub[] = FINANCE_HUBS;

export function getFinanceHub(id: FinanceHubId): Hub {
  const hub = hubs.find((h) => h.id === id);
  if (!hub) throw new Error(`Unknown Finance hub: ${id}`);
  return hub;
}
