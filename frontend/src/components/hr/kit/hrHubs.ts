/**
 * HR hubs: one sidebar link per hub, each hub shows several existing pages as URL tabs (`?tab=`).
 *
 * This file is the single source of truth for:
 * - the hub routes in AppProtectedRouter (one route per hub `path`),
 * - the redirects from every old standalone page (`legacyPath`),
 * - the HR sidebar links, the command palette rows and the header Help lookup.
 */
import type { ComponentType } from "react";
import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  DoorOpen,
  Gavel,
  Gift,
  Settings2,
  Target,
  TreePalm,
  UserCircle,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type FeatureFlags = Record<string, boolean | string | number | null> | null | undefined;
type PageModule = Promise<{ default: ComponentType }>;

export interface HrHubTab {
  id: string;
  label: string;
  /** Old standalone route, relative to /app. It stays registered and redirects to this tab. */
  legacyPath: string;
  load: () => PageModule;
  /** Tab shows only when `feature_flags[key] === true` (same rule as the sidebar). */
  requiresFeatureFlag?: string;
  /** Tab shows when any of these flags is true. */
  requiresAnyFeatureFlag?: string[];
}

export interface HrHub {
  id: string;
  /** Route relative to /app. */
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** `self` = employee self-service: the login must be linked to an employee record. */
  audience: "staff" | "self";
  tabs: HrHubTab[];
}

/* Lazy page loaders (named exports → default for React.lazy). */
const pages = {
  myProfile: () => import("@/pages/app/hr/ess/HrMyProfilePage").then((m) => ({ default: m.HrMyProfilePage })),
  myAttendance: () => import("@/pages/app/hr/ess/HrMyAttendancePage").then((m) => ({ default: m.HrMyAttendancePage })),
  myLeave: () => import("@/pages/app/hr/ess/HrMyLeavePage").then((m) => ({ default: m.HrMyLeavePage })),
  myPayslips: () => import("@/pages/app/hr/ess/HrMyPayslipsPage").then((m) => ({ default: m.HrMyPayslipsPage })),
  myTickets: () => import("@/pages/app/hr/ess/HrEssTicketsPage").then((m) => ({ default: m.HrEssTicketsPage })),
  attendanceEntries: () =>
    import("@/pages/app/hr/attendance/HrAttendanceEntryPage").then((m) => ({ default: m.HrAttendanceEntryPage })),
  attendanceManual: () =>
    import("@/pages/app/hr/attendance/HrManualAttendancePage").then((m) => ({ default: m.HrManualAttendancePage })),
  regularizations: () =>
    import("@/pages/app/hr/attendance/HrRegularizationsPage").then((m) => ({ default: m.HrRegularizationsPage })),
  overtime: () => import("@/pages/app/hr/attendance/HrOvertimePage").then((m) => ({ default: m.HrOvertimePage })),
  attendanceSummary: () =>
    import("@/pages/app/hr/attendance/HrAttendanceSummaryPage").then((m) => ({ default: m.HrAttendanceSummaryPage })),
  leaveRequests: () => import("@/pages/app/hr/leave/HrLeaveRequestsPage").then((m) => ({ default: m.HrLeaveRequestsPage })),
  leaveApprovals: () =>
    import("@/pages/app/hr/leave/HrLeaveApprovalsPage").then((m) => ({ default: m.HrLeaveApprovalsPage })),
  leaveBalances: () => import("@/pages/app/hr/leave/HrLeaveBalancesPage").then((m) => ({ default: m.HrLeaveBalancesPage })),
  leaveCalendar: () => import("@/pages/app/hr/leave/HrLeaveCalendarPage").then((m) => ({ default: m.HrLeaveCalendarPage })),
  gatePasses: () => import("@/pages/app/hr/gate/HrGatePassesPage").then((m) => ({ default: m.HrGatePassesPage })),
  gateScan: () => import("@/pages/app/hr/gate/HrGateScanPage").then((m) => ({ default: m.HrGateScanPage })),
  cases: () => import("@/pages/app/hr/cases/HrEmployeeCasesPage").then((m) => ({ default: m.HrEmployeeCasesPage })),
  separations: () => import("@/pages/app/hr/separation/HrSeparationsPage").then((m) => ({ default: m.HrSeparationsPage })),
  payrollPeriods: () =>
    import("@/pages/app/hr/payroll/HrPayrollPeriodsPage").then((m) => ({ default: m.HrPayrollPeriodsPage })),
  payrollRuns: () => import("@/pages/app/hr/payroll/HrPayrollRunsPage").then((m) => ({ default: m.HrPayrollRunsPage })),
  payrollApprovals: () =>
    import("@/pages/app/hr/payroll/HrPayrollApprovalsPage").then((m) => ({ default: m.HrPayrollApprovalsPage })),
  payslips: () => import("@/pages/app/hr/payroll/HrPayslipsPage").then((m) => ({ default: m.HrPayslipsPage })),
  registers: () =>
    import("@/pages/app/hr/payroll/HrPayrollRegistersPage").then((m) => ({ default: m.HrPayrollRegistersPage })),
  advances: () => import("@/pages/app/hr/payroll/HrPayrollAdvancesPage").then((m) => ({ default: m.HrPayrollAdvancesPage })),
  bonuses: () => import("@/pages/app/hr/payroll/HrPayrollBonusesPage").then((m) => ({ default: m.HrPayrollBonusesPage })),
  allowances: () =>
    import("@/pages/app/hr/payroll/HrAllowancesBonusesPage").then((m) => ({ default: m.HrAllowancesBonusesPage })),
  requisitions: () =>
    import("@/pages/app/hr/recruitment/HrJobRequisitionsPage").then((m) => ({ default: m.HrJobRequisitionsPage })),
  candidates: () => import("@/pages/app/hr/recruitment/HrCandidatesPage").then((m) => ({ default: m.HrCandidatesPage })),
  interviews: () => import("@/pages/app/hr/recruitment/HrInterviewsPage").then((m) => ({ default: m.HrInterviewsPage })),
  offers: () => import("@/pages/app/hr/recruitment/HrOffersPage").then((m) => ({ default: m.HrOffersPage })),
  performanceDashboard: () =>
    import("@/pages/app/hr/performance/HrPerformanceDashboardPage").then((m) => ({
      default: m.HrPerformanceDashboardPage,
    })),
  performanceCycles: () =>
    import("@/pages/app/hr/performance/HrPerformanceCyclesPage").then((m) => ({ default: m.HrPerformanceCyclesPage })),
  goals: () => import("@/pages/app/hr/performance/HrGoalsPage").then((m) => ({ default: m.HrGoalsPage })),
  reviews: () => import("@/pages/app/hr/performance/HrReviewsPage").then((m) => ({ default: m.HrReviewsPage })),
  settings: () => import("@/pages/app/hr/HrSettingsPage").then((m) => ({ default: m.HrSettingsPage })),
  departments: () => import("@/pages/app/hr/HrDepartmentsPage").then((m) => ({ default: m.HrDepartmentsPage })),
  designations: () => import("@/pages/app/hr/HrDesignationsPage").then((m) => ({ default: m.HrDesignationsPage })),
  sections: () => import("@/pages/app/hr/HrSectionsPage").then((m) => ({ default: m.HrSectionsPage })),
  bangladeshSetup: () =>
    import("@/pages/app/hr/bangladesh/HrBangladeshSetupPage").then((m) => ({ default: m.HrBangladeshSetupPage })),
  shifts: () => import("@/pages/app/hr/attendance/HrShiftsPage").then((m) => ({ default: m.HrShiftsPage })),
  roster: () => import("@/pages/app/hr/attendance/HrRosterPage").then((m) => ({ default: m.HrRosterPage })),
  holidays: () =>
    import("@/pages/app/hr/attendance/HrAttendanceHolidaysPage").then((m) => ({ default: m.HrAttendanceHolidaysPage })),
  overtimeRules: () =>
    import("@/pages/app/hr/attendance/HrOvertimeRulesPage").then((m) => ({ default: m.HrOvertimeRulesPage })),
  devices: () =>
    import("@/pages/app/hr/attendance/HrAttendanceDevicesPage").then((m) => ({ default: m.HrAttendanceDevicesPage })),
  leaveTypes: () => import("@/pages/app/hr/leave/HrLeaveTypesPage").then((m) => ({ default: m.HrLeaveTypesPage })),
  leavePolicies: () => import("@/pages/app/hr/leave/HrLeavePoliciesPage").then((m) => ({ default: m.HrLeavePoliciesPage })),
  payrollComponents: () =>
    import("@/pages/app/hr/payroll/HrPayrollComponentsPage").then((m) => ({ default: m.HrPayrollComponentsPage })),
  salaryStructures: () =>
    import("@/pages/app/hr/payroll/HrSalaryStructuresPage").then((m) => ({ default: m.HrSalaryStructuresPage })),
  assignments: () =>
    import("@/pages/app/hr/payroll/PayrollEmployeeAssignmentPage").then((m) => ({
      default: m.PayrollEmployeeAssignmentPage,
    })),
  accountingConfig: () =>
    import("@/pages/app/hr/payroll/HrPayrollAccountingConfigPage").then((m) => ({
      default: m.HrPayrollAccountingConfigPage,
    })),
  statutory: () =>
    import("@/pages/app/hr/payroll/PayrollStatutoryConfigPage").then((m) => ({ default: m.PayrollStatutoryConfigPage })),
  reports: () => import("@/pages/app/hr/HrReportsDashboardPage").then((m) => ({ default: m.HrReportsDashboardPage })),
  compliance: () => import("@/pages/app/hr/HrCompliancePage").then((m) => ({ default: m.HrCompliancePage })),
  aiInsights: () => import("@/pages/app/hr/HrAiInsightsPage").then((m) => ({ default: m.HrAiInsightsPage })),
} satisfies Record<string, () => PageModule>;

export const HR_HUBS = [
  {
    id: "my",
    path: "hr/my",
    label: "My HR",
    description: "Your own profile, attendance, leave, payslips and HR tickets.",
    icon: UserCircle,
    audience: "self",
    tabs: [
      { id: "profile", label: "Profile", legacyPath: "hr/ess/profile", load: pages.myProfile },
      { id: "attendance", label: "Attendance", legacyPath: "hr/ess/attendance", load: pages.myAttendance },
      { id: "leave", label: "Leave", legacyPath: "hr/ess/leave", load: pages.myLeave },
      { id: "payslips", label: "Payslips", legacyPath: "hr/ess/payslips", load: pages.myPayslips },
      { id: "tickets", label: "Tickets", legacyPath: "hr/ess/tickets", load: pages.myTickets },
    ],
  },
  {
    id: "attendance",
    path: "hr/attendance",
    label: "Attendance",
    description: "Daily attendance, manual IN / OUT, corrections, overtime and the monthly summary.",
    icon: ClipboardCheck,
    audience: "staff",
    tabs: [
      { id: "entries", label: "Daily entry", legacyPath: "hr/attendance/entries", load: pages.attendanceEntries },
      { id: "manual", label: "Manual IN / OUT", legacyPath: "hr/attendance/manual", load: pages.attendanceManual },
      { id: "regularizations", label: "Regularizations", legacyPath: "hr/attendance/regularizations", load: pages.regularizations },
      { id: "overtime", label: "Overtime", legacyPath: "hr/attendance/overtime", load: pages.overtime },
      { id: "summary", label: "Summary", legacyPath: "hr/attendance/summary", load: pages.attendanceSummary },
    ],
  },
  {
    id: "leave",
    path: "hr/leave",
    label: "Leave",
    description: "Leave requests, approvals, balances and the team leave calendar.",
    icon: TreePalm,
    audience: "staff",
    tabs: [
      { id: "requests", label: "Requests", legacyPath: "hr/leave/requests", load: pages.leaveRequests },
      { id: "approvals", label: "Approvals", legacyPath: "hr/leave/approvals", load: pages.leaveApprovals },
      { id: "balances", label: "Balances", legacyPath: "hr/leave/balances", load: pages.leaveBalances },
      { id: "calendar", label: "Calendar", legacyPath: "hr/leave/calendar", load: pages.leaveCalendar },
    ],
  },
  {
    id: "gate",
    path: "hr/gate",
    label: "Gate Passes",
    description: "Issue employee gate passes and scan them at the gate.",
    icon: DoorOpen,
    audience: "staff",
    tabs: [
      { id: "passes", label: "Gate passes", legacyPath: "hr/gate-passes", load: pages.gatePasses },
      { id: "scan", label: "Gate scan", legacyPath: "hr/gate-scan", load: pages.gateScan },
    ],
  },
  {
    id: "cases-exits",
    path: "hr/cases-exits",
    label: "Cases & Exits",
    description: "Notices, disciplinary cases, separations and final settlement.",
    icon: Gavel,
    audience: "staff",
    tabs: [
      { id: "cases", label: "Notices & cases", legacyPath: "hr/cases", load: pages.cases },
      { id: "separations", label: "Separations & settlement", legacyPath: "hr/separations", load: pages.separations },
    ],
  },
  {
    id: "payroll",
    path: "hr/payroll",
    label: "Payroll",
    description: "Monthly payroll: periods, runs, approvals, payslips and salary sheets.",
    icon: CircleDollarSign,
    audience: "staff",
    tabs: [
      { id: "periods", label: "Periods", legacyPath: "hr/payroll/periods", load: pages.payrollPeriods },
      { id: "runs", label: "Runs", legacyPath: "hr/payroll/runs", load: pages.payrollRuns },
      { id: "approvals", label: "Approvals", legacyPath: "hr/payroll/approvals", load: pages.payrollApprovals },
      { id: "payslips", label: "Payslips", legacyPath: "hr/payroll/payslips", load: pages.payslips },
      { id: "registers", label: "Salary sheets & registers", legacyPath: "hr/payroll/registers", load: pages.registers },
    ],
  },
  {
    id: "payroll-extras",
    path: "hr/payroll-extras",
    label: "Payroll Extras",
    description: "Advances and loans, bonuses, and allowances paid outside the basic salary.",
    icon: Gift,
    audience: "staff",
    tabs: [
      { id: "advances", label: "Advances & loans", legacyPath: "hr/payroll/advances", load: pages.advances },
      { id: "bonuses", label: "Bonuses", legacyPath: "hr/payroll/bonuses", load: pages.bonuses },
      {
        id: "allowances",
        label: "Allowances & bonuses",
        legacyPath: "hr/payroll/allowances",
        load: pages.allowances,
        requiresAnyFeatureFlag: ["hr_meal_night_bills_enabled", "hr_production_bonus_enabled", "hr_festival_bonus_enabled"],
      },
    ],
  },
  {
    id: "recruitment",
    path: "hr/recruitment",
    label: "Recruitment",
    description: "Job requisitions, candidates, interviews and offers.",
    icon: UserPlus,
    audience: "staff",
    tabs: [
      { id: "requisitions", label: "Job requisitions", legacyPath: "hr/recruitment/requisitions", load: pages.requisitions },
      { id: "candidates", label: "Candidates", legacyPath: "hr/recruitment/candidates", load: pages.candidates },
      { id: "interviews", label: "Interviews", legacyPath: "hr/recruitment/interviews", load: pages.interviews },
      { id: "offers", label: "Offers", legacyPath: "hr/recruitment/offers", load: pages.offers },
    ],
  },
  {
    id: "performance",
    path: "hr/performance",
    label: "Performance",
    description: "Performance cycles, goals and reviews.",
    icon: Target,
    audience: "staff",
    tabs: [
      { id: "dashboard", label: "Dashboard", legacyPath: "hr/performance/dashboard", load: pages.performanceDashboard },
      { id: "cycles", label: "Cycles", legacyPath: "hr/performance/cycles", load: pages.performanceCycles },
      { id: "goals", label: "Goals", legacyPath: "hr/performance/goals", load: pages.goals },
      { id: "reviews", label: "Reviews", legacyPath: "hr/performance/reviews", load: pages.reviews },
    ],
  },
  {
    id: "setup",
    path: "hr/setup",
    label: "HR Setup",
    description: "Company HR settings, departments, designations, sections and the Bangladesh setup wizard.",
    icon: Settings2,
    audience: "staff",
    tabs: [
      { id: "settings", label: "Settings", legacyPath: "hr/settings", load: pages.settings },
      { id: "departments", label: "Departments", legacyPath: "hr/departments", load: pages.departments },
      { id: "designations", label: "Designations", legacyPath: "hr/designations", load: pages.designations },
      { id: "sections", label: "Sections & lines", legacyPath: "hr/sections", load: pages.sections },
      { id: "bangladesh", label: "Bangladesh setup", legacyPath: "hr/bangladesh-setup", load: pages.bangladeshSetup },
    ],
  },
  {
    id: "attendance-setup",
    path: "hr/attendance-setup",
    label: "Attendance Setup",
    description: "Shifts, weekly roster, holidays, overtime rules and attendance devices.",
    icon: CalendarClock,
    audience: "staff",
    tabs: [
      { id: "shifts", label: "Shifts", legacyPath: "hr/attendance/shifts", load: pages.shifts },
      { id: "roster", label: "Roster", legacyPath: "hr/attendance/roster", load: pages.roster },
      { id: "holidays", label: "Holidays", legacyPath: "hr/attendance/holidays", load: pages.holidays },
      { id: "overtime-rules", label: "Overtime rules", legacyPath: "hr/attendance/overtime-rules", load: pages.overtimeRules },
      { id: "devices", label: "Devices", legacyPath: "hr/attendance/devices", load: pages.devices },
    ],
  },
  {
    id: "leave-payroll-setup",
    path: "hr/leave-payroll-setup",
    label: "Leave & Payroll Setup",
    description: "Leave types and policies, salary components and structures, and payroll accounting.",
    icon: Wallet,
    audience: "staff",
    tabs: [
      { id: "leave-types", label: "Leave types", legacyPath: "hr/leave/types", load: pages.leaveTypes },
      { id: "leave-policies", label: "Leave policies", legacyPath: "hr/leave/policies", load: pages.leavePolicies },
      { id: "components", label: "Salary components", legacyPath: "hr/payroll/components", load: pages.payrollComponents },
      { id: "structures", label: "Salary structures", legacyPath: "hr/payroll/salary-structures", load: pages.salaryStructures },
      { id: "assignments", label: "Structure assignments", legacyPath: "hr/payroll/assignments", load: pages.assignments },
      { id: "accounting", label: "Accounting", legacyPath: "hr/payroll/accounting-config", load: pages.accountingConfig },
      {
        id: "statutory",
        label: "Statutory",
        legacyPath: "hr/payroll/statutory",
        load: pages.statutory,
        requiresFeatureFlag: "statutory_payroll_enabled",
      },
    ],
  },
  {
    id: "insights",
    path: "hr/insights",
    label: "Reports & Insights",
    description: "HR reports, compliance tracking and AI insights.",
    icon: BarChart3,
    audience: "staff",
    tabs: [
      { id: "reports", label: "HR reports", legacyPath: "hr/reports", load: pages.reports },
      {
        id: "compliance",
        label: "Compliance",
        legacyPath: "hr/compliance",
        load: pages.compliance,
        requiresFeatureFlag: "compliance_tracking_enabled",
      },
      {
        id: "ai",
        label: "AI insights",
        legacyPath: "hr/ai-insights",
        load: pages.aiInsights,
        requiresAnyFeatureFlag: [
          "ai_attendance_analysis_enabled",
          "ai_turnover_prediction_enabled",
          "ai_payroll_anomaly_detection_enabled",
          "ai_compliance_risk_prediction_enabled",
        ],
      },
    ],
  },
] as const satisfies readonly HrHub[];

export type HrHubId = (typeof HR_HUBS)[number]["id"];

export function getHrHub(id: HrHubId): HrHub {
  const hub = HR_HUBS.find((h) => h.id === id);
  if (!hub) throw new Error(`Unknown HR hub: ${id}`);
  return hub;
}

export function hrHubHref(hub: HrHub, tabId?: string): string {
  return tabId ? `/app/${hub.path}?tab=${encodeURIComponent(tabId)}` : `/app/${hub.path}`;
}

export function isHrTabVisible(tab: HrHubTab, featureFlags: FeatureFlags): boolean {
  if (tab.requiresFeatureFlag && featureFlags?.[tab.requiresFeatureFlag] !== true) return false;
  if (tab.requiresAnyFeatureFlag?.length && !tab.requiresAnyFeatureFlag.some((k) => featureFlags?.[k] === true)) {
    return false;
  }
  return true;
}

export function visibleHrTabs(hub: HrHub, featureFlags: FeatureFlags): HrHubTab[] {
  return hub.tabs.filter((t) => isHrTabVisible(t, featureFlags));
}

/** Old standalone route (relative to /app) → hub and tab. */
export function findHrLegacyTarget(legacyPath: string): { hub: HrHub; tab: HrHubTab } | null {
  for (const hub of HR_HUBS as readonly HrHub[]) {
    const tab = hub.tabs.find((t) => t.legacyPath === legacyPath);
    if (tab) return { hub, tab };
  }
  return null;
}

/**
 * Tutorials list the old page routes. On a hub, use the open tab's old route so the
 * header Help button keeps finding the right articles. Other paths pass through.
 */
export function resolveHrHelpPath(pathname: string, search: string, featureFlags?: FeatureFlags): string {
  const clean = pathname.replace(/\/+$/, "");
  const hub = (HR_HUBS as readonly HrHub[]).find((h) => clean === `/app/${h.path}`);
  if (!hub) return pathname;
  // Same choice as HrHubPage: a hidden or unknown tab shows the first visible tab.
  const tabs = visibleHrTabs(hub, featureFlags);
  const requested = new URLSearchParams(search).get("tab");
  const tab = tabs.find((t) => t.id === requested) ?? tabs[0];
  return tab ? `/app/${tab.legacyPath}` : pathname;
}

/** Command palette rows: every visible hub tab, so "Payslips" or "Overtime" stays searchable. */
export function hrTabPaletteRoutes(featureFlags: FeatureFlags): { href: string; label: string; section: string; icon: LucideIcon }[] {
  return (HR_HUBS as readonly HrHub[]).flatMap((hub) =>
    visibleHrTabs(hub, featureFlags).map((tab) => ({
      href: hrHubHref(hub, tab.id),
      label: tab.label,
      section: `HR · ${hub.label}`,
      icon: hub.icon,
    })),
  );
}
