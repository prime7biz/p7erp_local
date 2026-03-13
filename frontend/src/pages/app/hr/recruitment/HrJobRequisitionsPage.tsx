import { api, type HrJobRequisitionCreate, type HrJobRequisitionResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrJobRequisitionsPage() {
  return (
    <HrSimpleCrudPage<HrJobRequisitionResponse, HrJobRequisitionCreate>
      title="Job Requisitions"
      description="Create manpower requisitions by role and department."
      emptyMessage="No job requisitions found."
      loadItems={() => api.listHrJobRequisitions()}
      createItem={(payload) => api.createHrJobRequisition(payload)}
      createLabel="Add requisition"
      initialForm={{
        req_code: "",
        title: "",
        department_id: null,
        openings: 1,
      }}
      fields={[
        { key: "req_code", label: "Requisition Code", type: "text", required: true },
        { key: "title", label: "Title", type: "text", required: true },
        { key: "department_id", label: "Department ID", type: "number" },
        { key: "openings", label: "Openings", type: "number", required: true },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.req_code },
        { header: "Title", cell: (row) => row.title },
        { header: "Department ID", cell: (row) => row.department_id },
        { header: "Openings", cell: (row) => row.openings },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
