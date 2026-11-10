import { api, type HrAttendanceSummaryRow } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrAttendanceSummaryFilter {
  month: string;
}

export function HrAttendanceSummaryPage() {
  return (
    <HrSimpleCrudPage<HrAttendanceSummaryRow, HrAttendanceSummaryFilter>
      title="Attendance Summary"
      description="Monthly present, absent, late and leave days per employee."
      emptyMessage="No attendance summary data found."
      emptyHint="Enter attendance on the Daily entry tab or import it from devices."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Attendance summary" }]}
      loadItems={() => api.listHrAttendanceSummary()}
      rowKey={(row) => row.employee_id}
      exportFileName="attendance-summary"
      columns={[
        { header: "Employee", cell: (row) => row.employee_id, kind: "employee" },
        { header: "Present", cell: (row) => row.present_days },
        { header: "Absent", cell: (row) => row.absent_days },
        { header: "Late", cell: (row) => row.late_days },
        { header: "Leave", cell: (row) => row.leave_days },
      ]}
    />
  );
}
