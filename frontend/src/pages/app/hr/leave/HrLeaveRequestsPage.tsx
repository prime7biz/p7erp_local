import { api, type HrLeaveRequestCreate, type HrLeaveRequestResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrLeaveRequestsPage() {
  return (
    <HrSimpleCrudPage<HrLeaveRequestResponse, HrLeaveRequestCreate>
      title="Leave Requests"
      description="Create and track employee leave requests."
      emptyMessage="No leave requests found."
      loadItems={() => api.listHrLeaveRequests()}
      createItem={(payload) => api.createHrLeaveRequest(payload)}
      createLabel="Add leave request"
      initialForm={{
        employee_id: 0,
        leave_type_id: 0,
        from_date: "",
        to_date: "",
        reason: "",
      }}
      fields={[
        { key: "employee_id", label: "Employee ID", type: "number", required: true },
        { key: "leave_type_id", label: "Leave Type ID", type: "number", required: true },
        { key: "from_date", label: "From Date", type: "date", required: true },
        { key: "to_date", label: "To Date", type: "date", required: true },
        { key: "reason", label: "Reason", type: "text" },
      ]}
      columns={[
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Leave Type ID", cell: (row) => row.leave_type_id },
        { header: "From", cell: (row) => row.from_date },
        { header: "To", cell: (row) => row.to_date },
        { header: "Days", cell: (row) => row.total_days },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
