import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type HrDashboardData } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageErrorClass, listPageRootClass, listPageToolbarButtonClass } from "@/components/app/listPageLayout";
import { KpiCard } from "@/components/hr/HrListParts";
import { useAuth } from "@/context/AuthContext";

const PREFIX = "/app/hr";

const LINK_GROUPS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Core HR",
    links: [
      { label: "Employees", to: `${PREFIX}/employees` },
      { label: "Departments", to: `${PREFIX}/departments` },
      { label: "Designations", to: `${PREFIX}/designations` },
      { label: "Sections & lines", to: `${PREFIX}/sections` },
      { label: "HR settings", to: `${PREFIX}/settings` },
    ],
  },
  {
    title: "Time & attendance",
    links: [
      { label: "Daily attendance", to: `${PREFIX}/attendance/entries` },
      { label: "Attendance summary", to: `${PREFIX}/attendance/summary` },
      { label: "Roster", to: `${PREFIX}/attendance/roster` },
      { label: "Overtime", to: `${PREFIX}/attendance/overtime` },
      { label: "Holidays", to: `${PREFIX}/attendance/holidays` },
    ],
  },
  {
    title: "Leave",
    links: [
      { label: "Leave approvals", to: `${PREFIX}/leave/approvals` },
      { label: "Leave requests", to: `${PREFIX}/leave/requests` },
      { label: "Leave calendar", to: `${PREFIX}/leave/calendar` },
      { label: "Leave balances", to: `${PREFIX}/leave/balances` },
    ],
  },
  {
    title: "Payroll",
    links: [
      { label: "Payroll approvals", to: `${PREFIX}/payroll/approvals` },
      { label: "Payroll runs", to: `${PREFIX}/payroll/runs` },
      { label: "Payslips", to: `${PREFIX}/payroll/payslips` },
      { label: "Salary registers", to: `${PREFIX}/payroll/registers` },
    ],
  },
  {
    title: "Hiring & insights",
    links: [
      { label: "Job requisitions", to: `${PREFIX}/recruitment/requisitions` },
      { label: "Candidates", to: `${PREFIX}/recruitment/candidates` },
      { label: "HR reports", to: `${PREFIX}/reports` },
      { label: "AI insights", to: `${PREFIX}/ai-insights` },
    ],
  },
];

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function HrDashboardPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  // `/employees/new` only exists with the unified workspace; otherwise it redirects to the list.
  const workspaceV2 = me?.feature_flags?.hr_onboarding_workspace_v2 === true;
  const [data, setData] = useState<HrDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.getHrDashboardData();
      if (isCancelled()) return;
      setData(d);
      setLoadedAt(new Date());
    } catch (e) {
      if (!isCancelled()) setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const attendanceRate = Math.max(0, Math.min(100, data?.today_attendance_rate_percent ?? 0));
  const inactive = data ? Math.max(0, data.total_employees - data.active_employees) : 0;
  const attention = data
    ? [
        { count: data.pending_leave_requests, label: "leave request(s) waiting for approval", to: `${PREFIX}/leave/approvals`, action: "Review leave" },
        { count: data.pending_payroll_approvals, label: "payroll run(s) waiting for approval", to: `${PREFIX}/payroll/approvals`, action: "Review payroll" },
        { count: data.open_recruitment_requisitions, label: "open job requisition(s)", to: `${PREFIX}/recruitment/requisitions`, action: "Open hiring" },
      ].filter((a) => a.count > 0)
    : [];

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="HR Dashboard"
        description="Workforce, attendance, leave, payroll and hiring at a glance."
        actions={
          <>
            <button type="button" className={listPageToolbarButtonClass} onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
            <Link to={`${PREFIX}/employees`} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle">
              Employees
            </Link>
            {workspaceV2 && (
              <Link to={`${PREFIX}/employees/new`} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                + Add employee
              </Link>
            )}
          </>
        }
      />

      {error && <div className={listPageErrorClass}>{error}</div>}

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-busy="true" aria-label="Loading dashboard">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface-subtle" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* KPI cards: click to open the matching screen */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Total employees" value={data.total_employees} hint={`${inactive.toLocaleString()} inactive`} onClick={() => navigate(`${PREFIX}/employees`)} />
            <KpiCard
              label="Active"
              value={data.active_employees}
              hint={`${percent(data.active_employees, data.total_employees)}% of total`}
              onClick={() => navigate(`${PREFIX}/employees`)}
            />
            <KpiCard
              label="Attendance today"
              value={`${attendanceRate}%`}
              hint={`${data.today_attendance_entries.toLocaleString()} entries`}
              onClick={() => navigate(`${PREFIX}/attendance/entries`)}
            />
            <KpiCard label="Pending leave" value={data.pending_leave_requests} hint="Awaiting approval" onClick={() => navigate(`${PREFIX}/leave/approvals`)} />
            <KpiCard label="Payroll queue" value={data.pending_payroll_approvals} hint="Runs awaiting approval" onClick={() => navigate(`${PREFIX}/payroll/approvals`)} />
            <KpiCard label="Open hiring" value={data.open_recruitment_requisitions} hint="Requisitions" onClick={() => navigate(`${PREFIX}/recruitment/requisitions`)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Today's attendance */}
            <section className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Today&apos;s attendance</h2>
                <Link to={`${PREFIX}/attendance/summary`} className="text-xs font-medium text-brand-primary hover:underline">
                  Summary
                </Link>
              </div>
              <p className="mt-3 text-3xl font-semibold text-text-primary">{attendanceRate}%</p>
              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-subtle"
                role="progressbar"
                aria-valuenow={attendanceRate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Attendance rate today"
              >
                <div
                  className={`h-full rounded-full ${attendanceRate >= 90 ? "bg-status-success" : attendanceRate >= 75 ? "bg-status-warning" : "bg-status-danger"}`}
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-text-muted">
                {data.today_attendance_entries.toLocaleString()} attendance entries for {data.active_employees.toLocaleString()} active employees.
              </p>
              <Link
                to={`${PREFIX}/attendance/entries`}
                className="mt-3 inline-block rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
              >
                Open daily attendance
              </Link>
            </section>

            {/* Needs attention */}
            <section className="rounded-lg border border-border bg-surface-raised p-4 lg:col-span-2">
              <h2 className="text-sm font-semibold text-text-primary">Needs your attention</h2>
              {attention.length === 0 ? (
                <p className="mt-3 rounded-lg bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
                  All caught up: nothing is waiting for approval.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border-subtle">
                  {attention.map((a) => (
                    <li key={a.to} className="flex items-center justify-between gap-3 py-2.5">
                      <p className="text-sm text-text-secondary">
                        <span className="mr-1 inline-flex min-w-[2rem] justify-center rounded-full bg-status-warning-subtle px-2 py-0.5 text-xs font-semibold text-status-warning-foreground">
                          {a.count.toLocaleString()}
                        </span>
                        {a.label}
                      </p>
                      <Link to={a.to} className="whitespace-nowrap rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle">
                        {a.action}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}

      {/* Quick links, grouped by area */}
      <section className="rounded-lg border border-border bg-surface-raised p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Quick links</h2>
          {loadedAt && <span className="text-xs text-text-muted">Updated {loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LINK_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{g.title}</p>
              <ul className="mt-2 space-y-1">
                {g.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="block rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle hover:text-brand-primary">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
