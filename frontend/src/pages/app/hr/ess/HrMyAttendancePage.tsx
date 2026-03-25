import { api, type HrAttendanceEntryResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyAttendanceFilter {
  from_date: string;
}

export function HrMyAttendancePage() {
  return (
    <HrSimpleCrudPage<HrAttendanceEntryResponse, HrMyAttendanceFilter>
      title="My Attendance"
      description="Review your own attendance records."
      emptyMessage="No attendance records found."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "My Attendance" }]}
      loadItems={() => api.listHrEssMyAttendance()}
      columns={[
        { header: "Date", cell: (row) => row.attendance_date },
        { header: "In", cell: (row) => row.in_time },
        { header: "Out", cell: (row) => row.out_time },
        { header: "Status", cell: (row) => row.status },
        { header: "Remarks", cell: (row) => row.remarks },
      ]}
    />
  );
}
