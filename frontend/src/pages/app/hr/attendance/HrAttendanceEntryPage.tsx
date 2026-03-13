import { api, type HrAttendanceEntryCreate, type HrAttendanceEntryResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrAttendanceEntryPage() {
  return (
    <HrSimpleCrudPage<HrAttendanceEntryResponse, HrAttendanceEntryCreate>
      title="Attendance Entry"
      description="Record employee attendance and in/out times."
      emptyMessage="No attendance entries found."
      loadItems={() => api.listHrAttendanceEntries()}
      createItem={(payload) => api.createHrAttendanceEntry(payload)}
      createLabel="Add attendance"
      initialForm={{
        employee_id: 0,
        attendance_date: "",
        check_in: "",
        check_out: "",
        status: "present",
        note: "",
      }}
      fields={[
        { key: "employee_id", label: "Employee ID", type: "number", required: true },
        { key: "attendance_date", label: "Date", type: "date", required: true },
        { key: "check_in", label: "Check In (HH:mm)", type: "text" },
        { key: "check_out", label: "Check Out (HH:mm)", type: "text" },
        { key: "status", label: "Status", type: "text", required: true },
      ]}
      columns={[
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Date", cell: (row) => row.attendance_date },
        { header: "Check In", cell: (row) => row.check_in },
        { header: "Check Out", cell: (row) => row.check_out },
        { header: "Status", cell: (row) => row.status },
        { header: "Note", cell: (row) => row.note },
      ]}
    />
  );
}
