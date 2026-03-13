import { api, type HrAttendanceSummaryRow } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrAttendanceSummaryFilter {
  month: string;
}

export function HrAttendanceSummaryPage() {
  return (
    <HrSimpleCrudPage<HrAttendanceSummaryRow, HrAttendanceSummaryFilter>
      title="Attendance Summary"
      description="View monthly attendance summary by employee."
      emptyMessage="No attendance summary data found."
      loadItems={() => api.listHrAttendanceSummary()}
      columns={[
        { header: "Employee Code", cell: (row) => row.employee_code },
        { header: "Employee Name", cell: (row) => row.employee_name },
        { header: "Present", cell: (row) => row.present_days },
        { header: "Absent", cell: (row) => row.absent_days },
        { header: "Late", cell: (row) => row.late_days },
        { header: "Leave", cell: (row) => row.leave_days },
      ]}
    />
  );
}
