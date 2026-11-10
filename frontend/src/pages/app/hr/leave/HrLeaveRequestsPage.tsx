import { api, type HrLeaveRequestCreate, type HrLeaveRequestResponse } from "@/api/client";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrLeaveRequestsPage() {
  const leaveTypes = useHrOptions(
    "leaveTypes",
    () => api.listHrLeaveTypes(),
    (t) => ({ value: t.id, label: `${t.code} · ${t.name}` }),
  );
  return (
    <HrSimpleCrudPage<HrLeaveRequestResponse, HrLeaveRequestCreate>
      title="Leave Requests"
      description="Create and track employee leave requests."
      emptyMessage="No leave requests found."
      emptyHint="Add a request for an employee, or employees can apply themselves on My HR → Leave."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Leave requests" }]}
      loadItems={() => api.listHrLeaveRequests()}
      createItem={(payload) => api.createHrLeaveRequest(payload)}
      createLabel="Add leave request"
      exportFileName="leave-requests"
      initialForm={{
        employee_id: 0,
        leave_type_id: 0,
        from_date: "",
        to_date: "",
        days_requested: "1",
        reason: "",
      }}
      fields={[
        { key: "employee_id", label: "Employee", type: "employee", required: true },
        { key: "leave_type_id", label: "Leave type", type: "select", required: true, options: leaveTypes.options },
        { key: "from_date", label: "From date", type: "date", required: true },
        { key: "to_date", label: "To date", type: "date", required: true },
        {
          key: "days_requested",
          label: "Days requested",
          type: "text",
          required: true,
          hint: "Weekend days and company holidays are skipped when the request is saved.",
        },
        { key: "reason", label: "Reason", type: "textarea" },
      ]}
      columns={[
        { header: "Employee", cell: (row) => row.employee_id, kind: "employee" },
        { header: "Leave type", cell: (row) => leaveTypes.labelOf(row.leave_type_id) },
        { header: "From", cell: (row) => row.from_date },
        { header: "To", cell: (row) => row.to_date },
        { header: "Days", cell: (row) => row.days_requested },
        { header: "Status", cell: (row) => row.status, kind: "status" },
      ]}
    />
  );
}
