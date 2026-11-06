import { api, type HrCandidateCreate, type HrCandidateResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrCandidatesPage() {
  return (
    <HrSimpleCrudPage<HrCandidateResponse, HrCandidateCreate>
      title="Candidates"
      description="Maintain the candidate pipeline. Upload the CV on the employee file after hiring (HR > Employees > Documents)."
      emptyMessage="No candidates found."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Candidates" }]}
      loadItems={() => api.listHrCandidates()}
      createItem={(payload) => api.createHrCandidate(payload)}
      createLabel="Add candidate"
      initialForm={{
        full_name: "",
        email: "",
        phone: "",
        requisition_id: null,
        current_designation: "",
      }}
      fields={[
        { key: "full_name", label: "Full Name", type: "text", required: true },
        { key: "email", label: "Email", type: "text" },
        { key: "phone", label: "Mobile", type: "text" },
        { key: "current_designation", label: "Current designation", type: "text" },
        { key: "requisition_id", label: "Requisition ID", type: "number" },
      ]}
      columns={[
        { header: "ID", cell: (row) => row.id },
        { header: "Name", cell: (row) => row.full_name },
        { header: "Email", cell: (row) => row.email },
        { header: "Mobile", cell: (row) => row.phone },
        { header: "Requisition", cell: (row) => row.requisition_id ?? "-" },
        { header: "Stage", cell: (row) => row.stage },
      ]}
    />
  );
}
