import { useEffect, useState } from "react";
import {
  api,
  type HrAttendanceReportRow,
  type HrLeaveReportRow,
  type HrPayrollReportRow,
  type HrReportSummaryResponse,
} from "@/api/client";

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Reports Dashboard</h1>
          <p className="text-sm text-gray-500">Attendance, leave, and payroll insights in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Total Employees</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{loading || !summary ? "-" : summary.total_employees}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Attendance Rate</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {loading || !summary ? "-" : `${summary.attendance_rate_percent}%`}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Pending Leave Requests</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {loading || !summary ? "-" : summary.pending_leave_requests}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Payroll Runs (Month)</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {loading || !summary ? "-" : summary.payroll_runs_this_month}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Attendance Report</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Present</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Absent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Leave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {attendanceRows.map((row) => (
                <tr key={`${row.employee_code}-${row.employee_name}`}>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.employee_code}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.employee_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.present_days}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.absent_days}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.leave_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Leave Report</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Leave Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Approved</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Pending</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {leaveRows.map((row) => (
                <tr key={row.leave_type}>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.leave_type}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.total_requests}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.approved_requests}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.pending_requests}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.rejected_requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Payroll Report</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Employees</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Gross</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Deductions</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {payrollRows.map((row) => (
                <tr key={row.payroll_period}>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.payroll_period}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.total_employees}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.gross_total}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.deduction_total}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.net_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
