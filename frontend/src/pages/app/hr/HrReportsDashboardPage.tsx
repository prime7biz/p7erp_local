import { useEffect, useState } from "react";
import {
  api,
  type HrAttendanceReportRow,
  type HrLeaveReportRow,
  type HrPayrollReportRow,
  type HrReportSummaryResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

function money(value: string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}

const attendanceColumns: HrTableColumn<HrAttendanceReportRow>[] = [
  { key: "code", header: "Code", render: (r) => r.employee_code, value: (r) => r.employee_code },
  { key: "name", header: "Name", render: (r) => r.employee_name, value: (r) => r.employee_name },
  { key: "present", header: "Present", align: "right", render: (r) => r.present_days, value: (r) => r.present_days },
  { key: "absent", header: "Absent", align: "right", render: (r) => r.absent_days, value: (r) => r.absent_days },
  { key: "leave", header: "Leave", align: "right", render: (r) => r.leave_days, value: (r) => r.leave_days },
];

const leaveColumns: HrTableColumn<HrLeaveReportRow>[] = [
  { key: "type", header: "Leave Type", render: (r) => r.leave_type, value: (r) => r.leave_type },
  { key: "total", header: "Total", align: "right", render: (r) => r.total_requests, value: (r) => r.total_requests },
  { key: "approved", header: "Approved", align: "right", render: (r) => r.approved_requests, value: (r) => r.approved_requests },
  { key: "pending", header: "Pending", align: "right", render: (r) => r.pending_requests, value: (r) => r.pending_requests },
  { key: "rejected", header: "Rejected", align: "right", render: (r) => r.rejected_requests, value: (r) => r.rejected_requests },
];

const payrollColumns: HrTableColumn<HrPayrollReportRow>[] = [
  { key: "period", header: "Period", render: (r) => r.payroll_period, value: (r) => r.payroll_period },
  { key: "employees", header: "Employees", align: "right", render: (r) => r.total_employees, value: (r) => r.total_employees },
  { key: "gross", header: "Gross", align: "right", render: (r) => <span className="tabular-nums">{money(r.gross_total)}</span>, value: (r) => r.gross_total },
  {
    key: "deductions",
    header: "Deductions",
    align: "right",
    render: (r) => <span className="tabular-nums">{money(r.deduction_total)}</span>,
    value: (r) => r.deduction_total,
  },
  { key: "net", header: "Net", align: "right", render: (r) => <span className="tabular-nums">{money(r.net_total)}</span>, value: (r) => r.net_total },
];

export function HrReportsDashboardPage() {
  const { me } = useAuth();
  const canExport = canExportHrData(me?.role_name);
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

      <section className="space-y-2" aria-labelledby="hr-report-attendance">
        <h2 id="hr-report-attendance" className="text-base font-semibold text-text-primary">Attendance Report</h2>
        <HrDataTable
          rows={attendanceRows}
          rowKey={(r) => `${r.employee_code}-${r.employee_name}`}
          columns={attendanceColumns}
          loading={loading}
          emptyTitle="No attendance data yet."
          searchPlaceholder="Search employee code or name…"
          exportFileName="hr-attendance-report"
          canExport={canExport}
        />
      </section>

      <section className="space-y-2" aria-labelledby="hr-report-leave">
        <h2 id="hr-report-leave" className="text-base font-semibold text-text-primary">Leave Report</h2>
        <HrDataTable
          rows={leaveRows}
          rowKey={(r) => r.leave_type}
          columns={leaveColumns}
          loading={loading}
          emptyTitle="No leave data yet."
          searchPlaceholder="Search leave type…"
          exportFileName="hr-leave-report"
          canExport={canExport}
        />
      </section>

      <section className="space-y-2" aria-labelledby="hr-report-payroll">
        <h2 id="hr-report-payroll" className="text-base font-semibold text-text-primary">Payroll Report</h2>
        <HrDataTable
          rows={payrollRows}
          rowKey={(r) => `${r.payroll_period}-${payrollRows.indexOf(r)}`}
          columns={payrollColumns}
          loading={loading}
          emptyTitle="No payroll data yet."
          searchPlaceholder="Search period…"
          exportFileName="hr-payroll-report"
          canExport={canExport}
        />
      </section>
    </div>
  );
}
