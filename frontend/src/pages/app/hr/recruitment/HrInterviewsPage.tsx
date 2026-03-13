import { api, type HrInterviewCreate, type HrInterviewResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrInterviewsPage() {
  return (
    <HrSimpleCrudPage<HrInterviewResponse, HrInterviewCreate>
      title="Interviews"
      description="Track interview schedules and outcomes."
      emptyMessage="No interviews found."
      loadItems={() => api.listHrInterviews()}
      createItem={(payload) => api.createHrInterview(payload)}
      createLabel="Add interview"
      initialForm={{
        candidate_id: 0,
        interview_date: "",
        interviewer: "",
        result: "pending",
        note: "",
      }}
      fields={[
        { key: "candidate_id", label: "Candidate ID", type: "number", required: true },
        { key: "interview_date", label: "Interview Date", type: "date", required: true },
        { key: "interviewer", label: "Interviewer", type: "text" },
        { key: "result", label: "Result", type: "text" },
      ]}
      columns={[
        { header: "Candidate ID", cell: (row) => row.candidate_id },
        { header: "Date", cell: (row) => row.interview_date },
        { header: "Interviewer", cell: (row) => row.interviewer },
        { header: "Result", cell: (row) => row.result },
        { header: "Note", cell: (row) => row.note },
      ]}
    />
  );
}
