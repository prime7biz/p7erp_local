import { useEffect, useState } from "react";
import {
  api,
  type HrAttendanceReportRow,
  type HrLeaveReportRow,
  type HrPayrollReportRow,
  type HrReportSummaryResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

export function HrReportsDashboardPage() {
  const [summary, setSummary] = useState<HrReportSummaryResponse | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<HrAttendanceReportRow[]>([]);
  const [leaveRows, setLeaveRows] = useState<HrLeaveReportRow[]>([]);
  const [payrollRows, setPayrollRows] = useState<HrPayrollReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, attendanceData, leaveData, payrollData] = await Promise.all([
        api.getHrReportSummary(),
        api.listHrAttendanceReport(),
        api.listHrLeaveReport(),
        api.listHrPayrollReport(),
      ]);
      setSummary(summaryData);
      setAttendanceRows(attendanceData);
      setLeaveRows(leaveData);
      setPayrollRows(payrollData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load HR reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <HrPageHeader
          title="HR Reports"
          description="Attendance, leave, and payroll insights in one place."
          breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Reports" }]}
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Total Employees</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{loading || !summary ? "-" : summary.total_employees}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Attendance Rate</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">
            {loading || !summary ? "-" : `${summary.attendance_rate_percent}%`}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Pending Leave Requests</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">
            {loading || !summary ? "-" : summary.pending_leave_requests}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Payroll Runs (Month)</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">
            {loading || !summary ? "-" : summary.payroll_runs_this_month}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Attendance Report</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Present</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Absent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Leave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface-raised">
              {attendanceRows.map((row) => (
                <tr key={`${row.employee_code}-${row.employee_name}`}>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.employee_code}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.employee_name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.present_days}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.absent_days}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.leave_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Leave Report</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Leave Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Approved</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Pending</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface-raised">
              {leaveRows.map((row) => (
                <tr key={row.leave_type}>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.leave_type}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.total_requests}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.approved_requests}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.pending_requests}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.rejected_requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Payroll Report</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Employees</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Gross</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Deductions</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface-raised">
              {payrollRows.map((row) => (
                <tr key={row.payroll_period}>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.payroll_period}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.total_employees}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.gross_total}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.deduction_total}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.net_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
