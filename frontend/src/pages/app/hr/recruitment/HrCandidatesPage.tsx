import { api, type HrCandidateCreate, type HrCandidateResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrCandidatesPage() {
  return (
    <HrSimpleCrudPage<HrCandidateResponse, HrCandidateCreate>
      title="Candidates"
      description="Maintain candidate pipeline for recruitment."
      emptyMessage="No candidates found."
      loadItems={() => api.listHrCandidates()}
      createItem={(payload) => api.createHrCandidate(payload)}
      createLabel="Add candidate"
      initialForm={{
        candidate_code: "",
        full_name: "",
        email: "",
        phone: "",
        applied_requisition_id: null,
      }}
      fields={[
        { key: "candidate_code", label: "Candidate Code", type: "text", required: true },
        { key: "full_name", label: "Full Name", type: "text", required: true },
        { key: "email", label: "Email", type: "text" },
        { key: "phone", label: "Phone", type: "text" },
        { key: "applied_requisition_id", label: "Requisition ID", type: "number" },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.candidate_code },
        { header: "Name", cell: (row) => row.full_name },
        { header: "Email", cell: (row) => row.email },
        { header: "Phone", cell: (row) => row.phone },
        { header: "Requisition ID", cell: (row) => row.applied_requisition_id },
        { header: "Stage", cell: (row) => row.stage },
      ]}
    />
  );
}
