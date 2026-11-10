import { describe, expect, it } from "vitest";
import routerSource from "@/app/AppProtectedRouter.tsx?raw";
import { menuSections } from "@/app/sidebarConfig";
import {
  HR_HUBS,
  findHrLegacyTarget,
  hrTabPaletteRoutes,
  isHrTabVisible,
  resolveHrHelpPath,
  visibleHrTabs,
  type HrHub,
} from "./hrHubs";

const hubs = HR_HUBS as readonly HrHub[];

/** Every standalone HR route that existed before the hubs (AppProtectedRouter, 2026-11-10). */
const LEGACY_HR_ROUTES = [
  "hr",
  "hr/departments",
  "hr/designations",
  "hr/sections",
  "hr/employees",
  "hr/employees/new",
  "hr/employees/ai-onboard",
  "hr/employees/:employeeId",
  "hr/attendance/shifts",
  "hr/attendance/holidays",
  "hr/attendance/roster",
  "hr/attendance/entries",
  "hr/attendance/devices",
  "hr/settings",
  "hr/bangladesh-setup",
  "hr/bangladesh-rules",
  "hr/attendance/manual",
  "hr/gate-passes",
  "hr/gate-scan",
  "hr/cases",
  "hr/separations",
  "hr/attendance/regularizations",
  "hr/attendance/overtime-rules",
  "hr/attendance/overtime",
  "hr/attendance/summary",
  "hr/leave/types",
  "hr/leave/policies",
  "hr/leave/balances",
  "hr/leave/requests",
  "hr/leave/approvals",
  "hr/leave/calendar",
  "hr/payroll/components",
  "hr/payroll/periods",
  "hr/payroll/salary-structures",
  "hr/payroll/assignments",
  "hr/payroll/runs",
  "hr/payroll/advances",
  "hr/payroll/bonuses",
  "hr/payroll/accounting-config",
  "hr/payroll/statutory",
  "hr/payroll/approvals",
  "hr/payroll/payslips",
  "hr/payroll/registers",
  "hr/payroll/allowances",
  "hr/performance/cycles",
  "hr/performance/goals",
  "hr/performance/reviews",
  "hr/performance/dashboard",
  "hr/recruitment/requisitions",
  "hr/recruitment/candidates",
  "hr/recruitment/interviews",
  "hr/recruitment/offers",
  "hr/ess/profile",
  "hr/ess/attendance",
  "hr/ess/leave",
  "hr/ess/payslips",
  "hr/ess/tickets",
  "hr/compliance",
  "hr/ai-insights",
  "hr/reports",
];

/** Routes that keep their own page (not moved into a hub). */
const KEPT_ROUTES = new Set([
  "hr",
  "hr/employees",
  "hr/employees/new",
  "hr/employees/ai-onboard",
  "hr/employees/:employeeId",
  "hr/bangladesh-rules",
]);

function routeElement(path: string): string | null {
  const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const match = routerSource.match(new RegExp(`<Route\\s+path="${escaped}"\\s+element=\\{(<[^}]*?/>)\\}`));
  return match?.[1] ?? null;
}

describe("HR hub route contract", () => {
  it("keeps every old HR route registered: own page or a redirect to its hub tab", () => {
    const problems: string[] = [];
    for (const path of LEGACY_HR_ROUTES) {
      const element = routeElement(path);
      if (!element) {
        problems.push(`${path}: no <Route>`);
        continue;
      }
      if (KEPT_ROUTES.has(path)) {
        if (element.includes("HrLegacyRedirect")) problems.push(`${path}: should keep its own page`);
        continue;
      }
      if (element !== `<HrLegacyRedirect from="${path}" />`) problems.push(`${path}: expected redirect, got ${element}`);
      if (!findHrLegacyTarget(path)) problems.push(`${path}: no hub tab has this legacyPath`);
    }
    expect(problems).toEqual([]);
  });

  it("maps every hub tab to exactly one old route", () => {
    const legacy = hubs.flatMap((h) => h.tabs.map((t) => t.legacyPath));
    expect(new Set(legacy).size).toBe(legacy.length);
    expect(legacy.filter((p) => !LEGACY_HR_ROUTES.includes(p))).toEqual([]);
    expect(legacy.length + KEPT_ROUTES.size).toBe(LEGACY_HR_ROUTES.length);
  });

  it("registers each hub route with its own hub id and unique tab ids", () => {
    for (const hub of hubs) {
      expect(routeElement(hub.path)).toBe(`<HrHubPage hubId="${hub.id}" />`);
      const ids = hub.tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(hub.tabs.some((t) => !t.requiresFeatureFlag && !t.requiresAnyFeatureFlag)).toBe(true);
    }
  });

  it("keeps all HR routes behind the hr.access route guard", () => {
    const start = routerSource.indexOf("<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.hr} />");
    const end = routerSource.indexOf("</Route>", start);
    expect(start).toBeGreaterThan(-1);
    const block = routerSource.slice(start, end);
    for (const path of [...LEGACY_HR_ROUTES, ...hubs.map((h) => h.path)]) {
      expect(block, path).toContain(`path="${path}"`);
    }
  });
});

describe("HR sidebar", () => {
  const hr = menuSections.find((s) => s.section === "HR");
  const hrefs = (hr?.subsections ?? []).flatMap((sub) => sub.items.map((i) => i.href));

  it("shows 16 links: dashboard, employees, Bangladesh rules and one per hub", () => {
    expect(hrefs).toHaveLength(16);
    expect(new Set(hrefs).size).toBe(16);
    for (const hub of hubs) expect(hrefs).toContain(`/app/${hub.path}`);
    expect(hrefs).toEqual(expect.arrayContaining(["/app/hr", "/app/hr/employees", "/app/hr/bangladesh-rules"]));
  });
});

describe("HR hub tabs", () => {
  const extras = hubs.find((h) => h.id === "payroll-extras")!;
  const setup = hubs.find((h) => h.id === "leave-payroll-setup")!;

  it("hides flagged tabs until their flag is true", () => {
    expect(visibleHrTabs(extras, {}).map((t) => t.id)).toEqual(["advances", "bonuses"]);
    expect(visibleHrTabs(extras, { hr_festival_bonus_enabled: true }).map((t) => t.id)).toContain("allowances");
    const statutory = setup.tabs.find((t) => t.id === "statutory")!;
    expect(isHrTabVisible(statutory, { statutory_payroll_enabled: false })).toBe(false);
    expect(isHrTabVisible(statutory, { statutory_payroll_enabled: true })).toBe(true);
  });

  it("lists visible tabs in the command palette", () => {
    const rows = hrTabPaletteRoutes({});
    expect(rows).toContainEqual(expect.objectContaining({ href: "/app/hr/payroll?tab=payslips", label: "Payslips" }));
    expect(rows.some((r) => r.href.endsWith("tab=allowances"))).toBe(false);
  });

  it("resolves Help on a hub to the open tab's old route", () => {
    expect(resolveHrHelpPath("/app/hr/leave", "?tab=approvals")).toBe("/app/hr/leave/approvals");
    expect(resolveHrHelpPath("/app/hr/leave/", "")).toBe("/app/hr/leave/requests");
    expect(resolveHrHelpPath("/app/hr/leave", "?tab=nope")).toBe("/app/hr/leave/requests");
    expect(resolveHrHelpPath("/app/hr/employees", "")).toBe("/app/hr/employees");
  });

  it("does not resolve Help to a tab that is switched off", () => {
    expect(resolveHrHelpPath("/app/hr/insights", "?tab=compliance", {})).toBe("/app/hr/reports");
    expect(resolveHrHelpPath("/app/hr/insights", "?tab=compliance", { compliance_tracking_enabled: true })).toBe(
      "/app/hr/compliance",
    );
  });
});
