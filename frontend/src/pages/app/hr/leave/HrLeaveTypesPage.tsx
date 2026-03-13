import { api, type HrLeaveTypeCreate, type HrLeaveTypeResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrLeaveTypesPage() {
  return (
    <HrSimpleCrudPage<HrLeaveTypeResponse, HrLeaveTypeCreate>
      title="Leave Types"
      description="Manage leave categories and yearly quota."
      emptyMessage="No leave types found."
      loadItems={() => api.listHrLeaveTypes({ active_only: false })}
      createItem={(payload) => api.createHrLeaveType(payload)}
      createLabel="Add leave type"
      initialForm={{
        code: "",
        name: "",
        annual_quota: 0,
        is_paid: true,
        is_active: true,
      }}
      fields={[
        { key: "code", label: "Code", type: "text", required: true },
        { key: "name", label: "Name", type: "text", required: true },
        { key: "annual_quota", label: "Annual Quota", type: "number", required: true },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.code },
        { header: "Name", cell: (row) => row.name },
        { header: "Quota", cell: (row) => row.annual_quota },
        { header: "Paid", cell: (row) => (row.is_paid ? "Yes" : "No") },
        { header: "Status", cell: (row) => (row.is_active ? "Active" : "Inactive") },
      ]}
    />
  );
}
