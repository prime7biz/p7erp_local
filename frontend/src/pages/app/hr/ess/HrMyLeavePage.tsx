import { api, type HrLeaveRequestResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyLeaveCreate {
  leave_type_id: number;
  from_date: string;
  to_date: string;
  reason: string;
}

export function HrMyLeavePage() {
  return (
    <HrSimpleCrudPage<HrLeaveRequestResponse, HrMyLeaveCreate>
      title="My Leave"
      description="Create your leave requests and check status."
      emptyMessage="No leave requests found."
      loadItems={() => api.listHrEssMyLeaveRequests()}
      createItem={(payload) => api.createHrEssMyLeaveRequest(payload)}
      createLabel="Request leave"
      initialForm={{
        leave_type_id: 0,
        from_date: "",
        to_date: "",
        reason: "",
      }}
      fields={[
        { key: "leave_type_id", label: "Leave Type ID", type: "number", required: true },
        { key: "from_date", label: "From Date", type: "date", required: true },
        { key: "to_date", label: "To Date", type: "date", required: true },
        { key: "reason", label: "Reason", type: "text" },
      ]}
      columns={[
        { header: "Leave Type ID", cell: (row) => row.leave_type_id },
        { header: "From", cell: (row) => row.from_date },
        { header: "To", cell: (row) => row.to_date },
        { header: "Days", cell: (row) => row.total_days },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
