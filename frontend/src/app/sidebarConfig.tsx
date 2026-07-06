import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LayoutGrid,
  Package,
  Users,
  ClipboardList,
  ShoppingCart,
  Shirt,
  Calculator,
  FileText,
  Settings,
  TrendingUp,
  Calendar,
  Factory,
  Shield,
  Truck,
  DollarSign,
  BarChart3,
  CheckSquare,
  Clock,
  CreditCard,
  Target,
  FileBarChart,
  Globe,
  Banknote,
  FolderTree,
  BookOpen,
  Scissors,
  ClipboardCheck,
  Layers,
  AlertTriangle,
  ArrowRightLeft,
  Activity,
  MessageSquare,
  Zap,
  UserCheck,
  Landmark,
  PieChart,
  FileSpreadsheet,
  Gauge,
  PackageCheck,
  Cog,
  FlaskConical,
  RotateCcw,
  ShieldCheck,
  ExternalLink,
  Wrench,
  UserCog,
  HardDrive,
  Building2,
  Menu,
  SlidersHorizontal,
  Droplets,
  PlusCircle,
} from "lucide-react";

export type TenantTypeFilter = "manufacturer" | "buying_house" | "both";

export interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  /** When true, only `pathname === href` counts as active (see `isSidebarNavItemActive`). */
  exact?: boolean;
  /** Small label e.g. "Soon" for routes not yet implemented. */
  badge?: string;
  visibleFor?: TenantTypeFilter[];
  /** If set, link is shown only when this key is in tenant production settings (`enabled_optional_units`). */
  productionUnitKey?: string;
  /** Hide when `me.feature_flags.trade_enabled === false` (Export/Import trade + logistics). */
  hideWhenTradeDisabled?: boolean;
  /** Show only when `me.feature_flags[this key] === true` (e.g. `control_tower_enabled`). */
  requiresFeatureFlag?: string;
  /** With `productionUnitKey: "knitting"`, also require `me.feature_flags.knitting_enabled === true` (hub page). */
  requiresKnittingTenantFeature?: boolean;
}

/** Nested groups under a section (e.g. HR sub-menus). */
export interface NavSubsection {
  label: string;
  items: NavItem[];
}

export interface MenuSection {
  section: string;
  icon: LucideIcon;
  directLink?: string;
  items: NavItem[];
  /** When set, render collapsible sub-groups instead of a flat item list. */
  subsections?: NavSubsection[];
  visibleFor?: TenantTypeFilter[];
}

export interface BottomNavItem {
  key: string;
  icon: LucideIcon;
  label: string;
  href: string;
  exact?: boolean;
  matchPrefixes?: string[];
  visibleFor?: TenantTypeFilter[];
  isMore?: boolean;
}

const PREFIX = "/app";

/** Active state for sidebar links: avoids `/app/inventory` matching every inventory sub-route. */
/** Sidebar / mobile nav: tenant type + optional production unit entitlement. */
export function isNavItemVisibleForTenant(
  item: NavItem,
  tenantType: TenantTypeFilter,
  enabledOptionalProductionUnits: string[],
  featureFlags?: Record<string, boolean | string | number | null> | null,
): boolean {
  const filter = item.visibleFor;
  if (filter && filter.length > 0) {
    if (tenantType !== "both" && !filter.includes(tenantType)) return false;
  }
  if (item.productionUnitKey && !enabledOptionalProductionUnits.includes(item.productionUnitKey)) return false;
  if (item.hideWhenTradeDisabled && featureFlags && featureFlags.trade_enabled === false) return false;
  if (item.requiresFeatureFlag) {
    if (!featureFlags || featureFlags[item.requiresFeatureFlag] !== true) return false;
  }
  if (item.requiresKnittingTenantFeature) {
    if (!featureFlags || featureFlags.knitting_enabled !== true) return false;
  }
  return true;
}

export function isSidebarNavItemActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  if (pathname === href) return true;
  if (href === `${PREFIX}/inventory`) {
    return pathname === `${PREFIX}/inventory/items`;
  }
  if (href !== PREFIX && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export const menuSections: MenuSection[] = [
  {
    section: "Dashboard",
    icon: LayoutDashboard,
    directLink: `${PREFIX}`,
    items: [],
  },
  {
    section: "Support",
    icon: MessageSquare,
    items: [
      { icon: ClipboardList, label: "My tickets", href: `${PREFIX}/support/tickets` },
      { icon: PlusCircle, label: "New ticket", href: `${PREFIX}/support/tickets/new` },
    ],
  },
  {
    section: "Merchandising",
    icon: Shirt,
    items: [
      { icon: Users, label: "Customers", href: `${PREFIX}/customers` },
      { icon: ClipboardList, label: "Inquiries", href: `${PREFIX}/inquiries` },
      { icon: FileText, label: "Quotations", href: `${PREFIX}/quotations` },
      { icon: ShoppingCart, label: "Orders", href: `${PREFIX}/orders` },
      { icon: LayoutGrid, label: "Merch control tower", href: `${PREFIX}/merchandising/control-tower` },
      { icon: Shirt, label: "Garment Styles", href: `${PREFIX}/merchandising/styles` },
      { icon: FlaskConical, label: "Sample development", href: `${PREFIX}/merchandising/samples` },
      { icon: Calculator, label: "BOM Builder", href: `${PREFIX}/bom` },
      { icon: Target, label: "Consumption Plans", href: `${PREFIX}/bom/orders` },
      { icon: TrendingUp, label: "Order Pipeline", href: `${PREFIX}/merchandising/pipeline` },
      { icon: BarChart3, label: "Pipeline Analytics", href: `${PREFIX}/merchandising/pipeline-analytics` },
      { icon: AlertTriangle, label: "Critical Alerts", href: `${PREFIX}/merchandising/alerts` },
      { icon: BarChart3, label: "Wastage Report", href: `${PREFIX}/merchandising/wastage-report` },
      { icon: ArrowRightLeft, label: "Consumption Recon", href: `${PREFIX}/merchandising/consumption-reconciliation` },
      { icon: Activity, label: "Follow-up & Unified TNA", href: `${PREFIX}/followup` },
      { icon: Users, label: "Parties", href: `${PREFIX}/parties` },
      { icon: TrendingUp, label: "Document Flow", href: `${PREFIX}/flow` },
    ],
  },
  {
    section: "Export & Import",
    icon: Globe,
    items: [
      { icon: Globe, label: "Commercial", href: `${PREFIX}/commercial` },
      { icon: Globe, label: "Export Cases", href: `${PREFIX}/commercial/export-cases` },
      { icon: BookOpen, label: "Master Contracts", href: `${PREFIX}/commercial/master-contracts` },
      { icon: FileText, label: "Proforma Invoices", href: `${PREFIX}/commercial/proforma-invoices` },
      { icon: ArrowRightLeft, label: "BTB LCs", href: `${PREFIX}/commercial/btb-lcs` },
      {
        icon: FolderTree,
        label: "Trade Cases",
        href: `${PREFIX}/trade/cases`,
        visibleFor: ["buying_house", "both"],
        hideWhenTradeDisabled: true,
      },
      {
        icon: BarChart3,
        label: "Trade Control Tower",
        href: `${PREFIX}/trade/dashboard`,
        visibleFor: ["buying_house", "both"],
        hideWhenTradeDisabled: true,
      },
      {
        icon: Truck,
        label: "Logistics",
        href: `${PREFIX}/logistics`,
        visibleFor: ["buying_house", "both"],
        hideWhenTradeDisabled: true,
      },
    ],
  },
  {
    section: "Operations",
    icon: Gauge,
    items: [
      {
        icon: Gauge,
        label: "Control Tower",
        href: `${PREFIX}/operations/control-tower`,
        requiresFeatureFlag: "control_tower_enabled",
      },
    ],
  },
  {
    section: "Inventory",
    icon: Package,
    items: [],
    subsections: [
      {
        label: "Master and setup",
        items: [
          { icon: Package, label: "Stock Master", href: `${PREFIX}/inventory` },
          { icon: FolderTree, label: "Stock Groups", href: `${PREFIX}/inventory/stock-groups` },
          { icon: Building2, label: "Vendors", href: `${PREFIX}/inventory/vendors` },
        ],
      },
      {
        label: "Procurement",
        items: [
          { icon: ShoppingCart, label: "Purchase Orders", href: `${PREFIX}/inventory/purchase-orders` },
          { icon: ClipboardCheck, label: "Goods Receiving", href: `${PREFIX}/inventory/goods-receiving` },
          { icon: Factory, label: "Process Orders", href: `${PREFIX}/inventory/process-orders` },
        ],
      },
      {
        label: "Stock control",
        items: [
          { icon: ArrowRightLeft, label: "Transfers", href: `${PREFIX}/inventory/warehouse-transfers` },
          { icon: ClipboardList, label: "Adjustments", href: `${PREFIX}/inventory/stock-adjustments` },
          { icon: Shield, label: "Consumption Control", href: `${PREFIX}/inventory/consumption-control` },
          { icon: FileBarChart, label: "Reconciliation", href: `${PREFIX}/inventory/reconciliation` },
        ],
      },
      {
        label: "Reports and analytics",
        items: [
          { icon: BarChart3, label: "Stock Summary", href: `${PREFIX}/inventory/stock-summary` },
          { icon: Layers, label: "Inventory Summary (FIFO)", href: `${PREFIX}/inventory/stock-inventory-summary` },
          { icon: Activity, label: "Dashboard", href: `${PREFIX}/inventory/stock-dashboard` },
          { icon: FileBarChart, label: "Ledger", href: `${PREFIX}/inventory/stock-ledger` },
          { icon: DollarSign, label: "Valuation", href: `${PREFIX}/inventory/stock-valuation` },
        ],
      },
      {
        label: "Outbound",
        items: [
          { icon: Truck, label: "Delivery Challans", href: `${PREFIX}/inventory/delivery-challans` },
          { icon: Shield, label: "Gate Passes", href: `${PREFIX}/inventory/enhanced-gate-passes` },
        ],
      },
      {
        label: "Traceability",
        items: [{ icon: Package, label: "Lot Traceability", href: `${PREFIX}/inventory/lots` }],
      },
    ],
  },
  {
    section: "Manufacturing",
    icon: Factory,
    visibleFor: ["manufacturer", "both"],
    items: [],
    subsections: [
      {
        label: "Overview",
        items: [
          { icon: Factory, label: "Production Overview", href: `${PREFIX}/production` },
          { icon: Package, label: "Manufacturing Orders", href: `${PREFIX}/production/manufacturing-orders` },
          { icon: Settings, label: "Production setup", href: `${PREFIX}/production/setup` },
          { icon: Calendar, label: "Factory calendar", href: `${PREFIX}/production/calendar` },
          { icon: Calendar, label: "Line plan board", href: `${PREFIX}/production/line-plan` },
          { icon: ClipboardList, label: "Planning", href: `${PREFIX}/production/planning` },
        ],
      },
      {
        label: "IE",
        items: [
          { icon: BookOpen, label: "Operations library", href: `${PREFIX}/production/ie/operations` },
          { icon: ClipboardList, label: "Operation bulletins", href: `${PREFIX}/production/ie/bulletins` },
          { icon: SlidersHorizontal, label: "Line balancing", href: `${PREFIX}/production/ie/line-balance` },
          { icon: Gauge, label: "IE & Efficiency (legacy)", href: `${PREFIX}/production/ie` },
        ],
      },
      {
        label: "Shop floor",
        items: [
          { icon: Scissors, label: "Cutting (shop floor)", href: `${PREFIX}/production/cutting` },
          { icon: Scissors, label: "Cutting pipeline", href: `${PREFIX}/production/cutting/pipeline` },
          { icon: Activity, label: "Hourly — Cutting", href: `${PREFIX}/production/hourly/cutting` },
          { icon: Cog, label: "Sewing (shop floor)", href: `${PREFIX}/production/sewing` },
          { icon: Activity, label: "Hourly — Sewing", href: `${PREFIX}/production/hourly/sewing` },
          { icon: Users, label: "Daily crew sheet", href: `${PREFIX}/production/crew-daily` },
          { icon: Calendar, label: "Weekly crew roster", href: `${PREFIX}/production/crew-roster` },
          { icon: ClipboardCheck, label: "Shop-floor QC", href: `${PREFIX}/production/quality` },
          { icon: Activity, label: "Hourly — Iron", href: `${PREFIX}/production/hourly/iron` },
          { icon: PackageCheck, label: "Finishing (shop floor)", href: `${PREFIX}/production/finishing-packing` },
          { icon: Activity, label: "Hourly — Finishing", href: `${PREFIX}/production/hourly/finishing` },
        ],
      },
      {
        label: "Units (optional)",
        items: [
          {
            icon: Shirt,
            label: "Knitting",
            href: `${PREFIX}/production/knitting`,
            productionUnitKey: "knitting",
            requiresKnittingTenantFeature: true,
          },
          {
            icon: Activity,
            label: "Hourly — Knitting",
            href: `${PREFIX}/production/hourly/knitting`,
            productionUnitKey: "knitting",
          },
          { icon: Droplets, label: "Dyeing", href: `${PREFIX}/production/dyeing`, productionUnitKey: "dyeing" },
          {
            icon: Activity,
            label: "Hourly — Dyeing",
            href: `${PREFIX}/production/hourly/dyeing`,
            productionUnitKey: "dyeing",
          },
          { icon: Layers, label: "Printing", href: `${PREFIX}/production/dept/printing`, productionUnitKey: "printing" },
          {
            icon: Activity,
            label: "Hourly — Printing",
            href: `${PREFIX}/production/hourly/printing`,
            productionUnitKey: "printing",
          },
          { icon: Layers, label: "AOP", href: `${PREFIX}/production/dept/aop`, productionUnitKey: "aop" },
          { icon: Activity, label: "Hourly — AOP", href: `${PREFIX}/production/hourly/aop`, productionUnitKey: "aop" },
          { icon: Layers, label: "Embroidery", href: `${PREFIX}/production/dept/embroidery`, productionUnitKey: "embroidery" },
          {
            icon: Activity,
            label: "Hourly — Embroidery",
            href: `${PREFIX}/production/hourly/embroidery`,
            productionUnitKey: "embroidery",
          },
          { icon: Layers, label: "Elastic", href: `${PREFIX}/production/dept/elastic`, productionUnitKey: "elastic" },
          {
            icon: Activity,
            label: "Hourly — Elastic",
            href: `${PREFIX}/production/hourly/elastic`,
            productionUnitKey: "elastic",
          },
          { icon: Layers, label: "Washing", href: `${PREFIX}/production/dept/washing`, productionUnitKey: "washing" },
          {
            icon: Activity,
            label: "Hourly — Washing",
            href: `${PREFIX}/production/hourly/washing`,
            productionUnitKey: "washing",
          },
        ],
      },
      {
        label: "Cost",
        items: [{ icon: DollarSign, label: "Cost & CM", href: `${PREFIX}/production/costs` }],
      },
      {
        label: "Samples & TNA",
        items: [
          { icon: Shirt, label: "Samples", href: `${PREFIX}/samples/requests` },
          { icon: Clock, label: "TNA Dashboard", href: `${PREFIX}/tna/dashboard` },
          { icon: ClipboardList, label: "TNA Templates", href: `${PREFIX}/tna/templates` },
          { icon: Calendar, label: "TNA Plans", href: `${PREFIX}/tna/plans` },
        ],
      },
    ],
  },
  {
    section: "Quality",
    icon: ShieldCheck,
    items: [
      { icon: BarChart3, label: "QC Dashboard", href: `${PREFIX}/quality/dashboard` },
      { icon: ClipboardCheck, label: "Inspections", href: `${PREFIX}/quality/inspections` },
      { icon: FlaskConical, label: "Lab Tests", href: `${PREFIX}/quality/lab-tests` },
      { icon: AlertTriangle, label: "CAPA", href: `${PREFIX}/quality/capa` },
      { icon: RotateCcw, label: "Returns", href: `${PREFIX}/quality/returns` },
      { icon: CheckSquare, label: "Quality (Legacy)", href: `${PREFIX}/quality/qc` },
    ],
  },
  {
    section: "AI Tools",
    icon: MessageSquare,
    items: [
      { icon: MessageSquare, label: "AI Assistant", href: `${PREFIX}/ai/assistant` },
      { icon: Zap, label: "AI Automation", href: `${PREFIX}/ai/automation` },
      { icon: Activity, label: "AI Predictions", href: `${PREFIX}/ai/predictions` },
      { icon: ClipboardList, label: "Weekly AI reports", href: `${PREFIX}/ai/weekly-reports` },
    ],
  },
  {
    section: "HR",
    icon: UserCheck,
    items: [],
    subsections: [
      {
        label: "Overview",
        items: [{ icon: LayoutDashboard, label: "HR Dashboard", href: `${PREFIX}/hr`, exact: true }],
      },
      {
        label: "Core HR",
        items: [
          { icon: FolderTree, label: "Departments", href: `${PREFIX}/hr/departments` },
          { icon: UserCog, label: "Designations", href: `${PREFIX}/hr/designations` },
          { icon: Factory, label: "Sections & Lines", href: `${PREFIX}/hr/sections` },
          { icon: UserCheck, label: "Employees", href: `${PREFIX}/hr/employees` },
        ],
      },
      {
        label: "Time & Attendance",
        items: [
          { icon: Clock, label: "Shifts", href: `${PREFIX}/hr/attendance/shifts` },
          { icon: Calendar, label: "Holidays", href: `${PREFIX}/hr/attendance/holidays` },
          { icon: Calendar, label: "Roster", href: `${PREFIX}/hr/attendance/roster` },
          { icon: ClipboardCheck, label: "Daily Entry", href: `${PREFIX}/hr/attendance/entries` },
          { icon: AlertTriangle, label: "Regularizations", href: `${PREFIX}/hr/attendance/regularizations` },
          { icon: Activity, label: "Overtime Rules", href: `${PREFIX}/hr/attendance/overtime-rules` },
          { icon: Clock, label: "Overtime", href: `${PREFIX}/hr/attendance/overtime` },
          { icon: BarChart3, label: "Summary", href: `${PREFIX}/hr/attendance/summary` },
        ],
      },
      {
        label: "Leave",
        items: [
          { icon: FileText, label: "Leave Types", href: `${PREFIX}/hr/leave/types` },
          { icon: BookOpen, label: "Policies", href: `${PREFIX}/hr/leave/policies` },
          { icon: BookOpen, label: "Balances", href: `${PREFIX}/hr/leave/balances` },
          { icon: ClipboardList, label: "Requests", href: `${PREFIX}/hr/leave/requests` },
          { icon: CheckSquare, label: "Approvals", href: `${PREFIX}/hr/leave/approvals` },
          { icon: Calendar, label: "Calendar", href: `${PREFIX}/hr/leave/calendar` },
        ],
      },
      {
        label: "Payroll",
        items: [
          { icon: Layers, label: "Components", href: `${PREFIX}/hr/payroll/components` },
          { icon: Layers, label: "Salary Structures", href: `${PREFIX}/hr/payroll/salary-structures` },
          { icon: Calendar, label: "Periods", href: `${PREFIX}/hr/payroll/periods` },
          { icon: DollarSign, label: "Runs", href: `${PREFIX}/hr/payroll/runs` },
          { icon: Banknote, label: "Advances & Loans", href: `${PREFIX}/hr/payroll/advances` },
          { icon: TrendingUp, label: "Bonuses", href: `${PREFIX}/hr/payroll/bonuses` },
          { icon: Landmark, label: "Accounting Config", href: `${PREFIX}/hr/payroll/accounting-config` },
          { icon: ShieldCheck, label: "Approvals", href: `${PREFIX}/hr/payroll/approvals` },
          { icon: FileSpreadsheet, label: "Payslips", href: `${PREFIX}/hr/payroll/payslips` },
        ],
      },
      {
        label: "Talent",
        items: [
          { icon: Calendar, label: "Performance Cycles", href: `${PREFIX}/hr/performance/cycles` },
          { icon: Target, label: "Goals", href: `${PREFIX}/hr/performance/goals` },
          { icon: Activity, label: "Reviews", href: `${PREFIX}/hr/performance/reviews` },
          { icon: Gauge, label: "Performance Dashboard", href: `${PREFIX}/hr/performance/dashboard` },
          { icon: Users, label: "Job Requisitions", href: `${PREFIX}/hr/recruitment/requisitions` },
          { icon: UserCheck, label: "Candidates", href: `${PREFIX}/hr/recruitment/candidates` },
          { icon: Calendar, label: "Interviews", href: `${PREFIX}/hr/recruitment/interviews` },
          { icon: FileText, label: "Offers", href: `${PREFIX}/hr/recruitment/offers` },
        ],
      },
      {
        label: "Self-Service",
        items: [
          { icon: UserCog, label: "My Profile", href: `${PREFIX}/hr/ess/profile` },
          { icon: Clock, label: "My Attendance", href: `${PREFIX}/hr/ess/attendance` },
          { icon: FileText, label: "My Leave", href: `${PREFIX}/hr/ess/leave` },
          { icon: FileSpreadsheet, label: "My Payslips", href: `${PREFIX}/hr/ess/payslips` },
          { icon: ClipboardList, label: "My Tickets", href: `${PREFIX}/hr/ess/tickets` },
        ],
      },
      {
        label: "Analytics",
        items: [
          { icon: Shield, label: "Compliance", href: `${PREFIX}/hr/compliance` },
          { icon: BarChart3, label: "HR Reports", href: `${PREFIX}/hr/reports` },
        ],
      },
    ],
  },
  {
    section: "Finance",
    icon: DollarSign,
    items: [],
    subsections: [
      {
        label: "Setup",
        items: [
          { icon: SlidersHorizontal, label: "Advance Options", href: `${PREFIX}/accounts/advance-options` },
          { icon: FolderTree, label: "Account Groups", href: `${PREFIX}/accounts/groups` },
          { icon: DollarSign, label: "Chart of Accounts", href: `${PREFIX}/accounts` },
          { icon: Target, label: "Cost Centers", href: `${PREFIX}/accounts/cost-centers` },
          { icon: Banknote, label: "Multi-Currency", href: `${PREFIX}/accounts/currency` },
          { icon: Calendar, label: "Accounting Periods", href: `${PREFIX}/accounts/accounting-periods` },
        ],
      },
      {
        label: "Transactions",
        items: [
          { icon: CreditCard, label: "Vouchers", href: `${PREFIX}/accounts/vouchers` },
          { icon: FileSpreadsheet, label: "Voucher Print", href: `${PREFIX}/accounts/vouchers/print` },
          { icon: ClipboardList, label: "Voucher Approvals", href: `${PREFIX}/accounts/vouchers/approval-queue` },
          { icon: FileText, label: "Bills", href: `${PREFIX}/accounts/outstanding-bills` },
          { icon: FileText, label: "Vendor bills (GRN)", href: `${PREFIX}/accounts/vendor-bills` },
          { icon: FileText, label: "Purchase & AP", href: `${PREFIX}/accounts/purchase-workflow` },
        ],
      },
      {
        label: "Banking",
        items: [
          { icon: Landmark, label: "Bank Accounts", href: `${PREFIX}/banking/accounts` },
          { icon: ArrowRightLeft, label: "Bank Reconciliation", href: `${PREFIX}/banking/reconciliation` },
          { icon: CreditCard, label: "Payment Runs", href: `${PREFIX}/banking/payment-runs` },
          { icon: FileText, label: "Payment Advice", href: `${PREFIX}/banking/payment-advice` },
          { icon: FileBarChart, label: "Settlement Audit", href: `${PREFIX}/banking/settlement-audit` },
          { icon: Banknote, label: "FX Receipts", href: `${PREFIX}/finance/fx-receipts` },
        ],
      },
      {
        label: "Reports",
        items: [
          { icon: BookOpen, label: "Day Book", href: `${PREFIX}/accounts/reports/day-book` },
          { icon: FileBarChart, label: "Trial Balance", href: `${PREFIX}/accounts/reports/trial-balance` },
          { icon: BarChart3, label: "Financial Statements", href: `${PREFIX}/accounts/reports/financial-statements` },
          { icon: TrendingUp, label: "Cash Flow", href: `${PREFIX}/accounts/reports/cash-flow` },
          { icon: FileText, label: "AR/AP Aging", href: `${PREFIX}/accounts/reports/ar-ap-aging` },
          { icon: BookOpen, label: "Ledger Activity", href: `${PREFIX}/accounts/reports/ledger-activity` },
          { icon: Activity, label: "Voucher Analytics", href: `${PREFIX}/accounts/reports/voucher-analytics` },
          { icon: PieChart, label: "Group Summary", href: `${PREFIX}/accounts/reports/group-summary` },
          { icon: Activity, label: "Ratio Analysis", href: `${PREFIX}/accounts/reports/ratio-analysis` },
        ],
      },
      {
        label: "Planning",
        items: [
          { icon: FileSpreadsheet, label: "Budgets", href: `${PREFIX}/accounts/budgets` },
          { icon: TrendingUp, label: "Cash Forecast", href: `${PREFIX}/finance/cash-forecast` },
          { icon: Calendar, label: "Cashflow Calendar", href: `${PREFIX}/cashflow/calendar` },
          { icon: Target, label: "Style Profitability", href: `${PREFIX}/finance/style-profitability` },
          { icon: Globe, label: "LC Profitability", href: `${PREFIX}/finance/lc-profitability` },
          { icon: BarChart3, label: "Costing Variance", href: `${PREFIX}/finance/costing-variance` },
        ],
      },
      {
        label: "Loans & facilities",
        items: [
          { icon: Gauge, label: "Facilities dashboard", href: `${PREFIX}/finance/facilities/dashboard` },
          { icon: Landmark, label: "All facilities", href: `${PREFIX}/finance/facilities` },
          { icon: BarChart3, label: "Business overview", href: `${PREFIX}/finance/business-overview` },
        ],
      },
    ],
  },
  {
    section: "Workflow",
    icon: ClipboardCheck,
    items: [
      { icon: ClipboardCheck, label: "All Approvals", href: `${PREFIX}/approvals` },
    ],
  },
  {
    section: "Reports",
    icon: BarChart3,
    items: [
      { icon: BarChart3, label: "Analytics", href: `${PREFIX}/reports` },
      { icon: Shirt, label: "Merchandising", href: `${PREFIX}/reports/merchandising` },
      { icon: Shirt, label: "Style 360", href: `${PREFIX}/reports/style-360` },
      { icon: ShoppingCart, label: "Purchase Orders", href: `${PREFIX}/reports/purchase-orders` },
      { icon: PackageCheck, label: "GRN Summary", href: `${PREFIX}/reports/grn` },
      { icon: FileText, label: "Sales Orders", href: `${PREFIX}/reports/sales-orders` },
      { icon: Landmark, label: "LC Outstanding", href: `${PREFIX}/reports/lc-outstanding` },
      { icon: Banknote, label: "BTB LC Maturity", href: `${PREFIX}/reports/btb-maturity` },
      { icon: Factory, label: "Production Efficiency", href: `${PREFIX}/reports/production-efficiency` },
      { icon: CheckSquare, label: "QC Summary", href: `${PREFIX}/reports/qc-summary` },
      { icon: Users, label: "Employee Summary", href: `${PREFIX}/reports/employee` },
      { icon: DollarSign, label: "Payroll Summary", href: `${PREFIX}/reports/payroll` },
      { icon: Truck, label: "Shipment Tracking", href: `${PREFIX}/reports/shipments` },
      { icon: ClipboardList, label: "Gate Pass Register", href: `${PREFIX}/reports/gate-passes` },
      { icon: FileSpreadsheet, label: "Delivery Challans", href: `${PREFIX}/reports/challans` },
      { icon: ArrowRightLeft, label: "Data Reconciliation", href: `${PREFIX}/reports/reconciliation` },
      { icon: AlertTriangle, label: "Exceptions", href: `${PREFIX}/reports/exceptions` },
      { icon: Globe, label: "Trade overview", href: `${PREFIX}/reports/trade-overview`, visibleFor: ["buying_house", "both"], hideWhenTradeDisabled: true },
    ],
  },
  {
    section: "Settings",
    icon: Settings,
    items: [
      { icon: Wrench, label: "Configuration", href: `${PREFIX}/settings/config` },
      { icon: Settings, label: "Settings", href: `${PREFIX}/settings` },
      { icon: UserCog, label: "User Mgmt", href: `${PREFIX}/settings/users` },
      { icon: Shield, label: "Roles", href: `${PREFIX}/settings/roles` },
      { icon: Building2, label: "Tenant", href: `${PREFIX}/settings/tenant` },
      { icon: DollarSign, label: "Pricing", href: `${PREFIX}/settings/pricing` },
      { icon: Activity, label: "Activity Logs", href: `${PREFIX}/settings/activity-logs` },
      { icon: ExternalLink, label: "External access", href: `${PREFIX}/settings/external-access` },
      { icon: DollarSign, label: "Currency", href: `${PREFIX}/settings/currency` },
      { icon: HardDrive, label: "Backup & Restore", href: `${PREFIX}/settings/backup` },
      { icon: ShieldCheck, label: "Statutory compliance", href: `${PREFIX}/settings/statutory-compliance` },
      { icon: FileSpreadsheet, label: "Data import", href: `${PREFIX}/settings/data-import` },
      { icon: Building2, label: "Bulk tenant onboarding", href: `${PREFIX}/settings/bulk-tenant-onboarding` },
      { icon: FileText, label: "Cheque Templates", href: `${PREFIX}/settings/cheque-templates` },
    ],
  },
];

export const bottomNavItems: BottomNavItem[] = [
  {
    key: "home",
    icon: LayoutDashboard,
    label: "Home",
    href: `${PREFIX}`,
    exact: true,
  },
  {
    key: "sales",
    icon: ShoppingCart,
    label: "Sales",
    href: `${PREFIX}/orders`,
    matchPrefixes: [
      `${PREFIX}/orders`,
      `${PREFIX}/inquiries`,
      `${PREFIX}/quotations`,
      `${PREFIX}/customers`,
      `${PREFIX}/merchandising`,
      `${PREFIX}/bom`,
      `${PREFIX}/commercial`,
      `${PREFIX}/trade`,
      `${PREFIX}/logistics`,
      `${PREFIX}/followup`,
      `${PREFIX}/parties`,
      `${PREFIX}/flow`,
    ],
  },
  {
    key: "inventory",
    icon: Package,
    label: "Stock",
    href: `${PREFIX}/inventory`,
    matchPrefixes: [`${PREFIX}/inventory`],
  },
  {
    key: "finance",
    icon: DollarSign,
    label: "Finance",
    href: `${PREFIX}/accounts`,
    matchPrefixes: [`${PREFIX}/accounts`, `${PREFIX}/banking`, `${PREFIX}/finance`, `${PREFIX}/cashflow`],
  },
  {
    key: "more",
    icon: Menu,
    label: "More",
    href: "#",
    isMore: true,
    matchPrefixes: [
      `${PREFIX}/hr`,
      `${PREFIX}/production`,
      `${PREFIX}/tna`,
      `${PREFIX}/quality`,
      `${PREFIX}/reports`,
      `${PREFIX}/settings`,
      `${PREFIX}/approvals`,
      `${PREFIX}/ai`,
      `${PREFIX}/tutorials`,
      `${PREFIX}/samples`,
    ],
  },
];
