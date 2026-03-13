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
      loadItems={() => api.listHrEssMyAttendance()}
      columns={[
        { header: "Date", cell: (row) => row.attendance_date },
        { header: "Check In", cell: (row) => row.check_in },
        { header: "Check Out", cell: (row) => row.check_out },
        { header: "Status", cell: (row) => row.status },
        { header: "Note", cell: (row) => row.note },
      ]}
    />
  );
}
