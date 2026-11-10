import { useState } from "react";
import { api, type HrInterviewCreate, type HrInterviewResponse } from "@/api/client";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

const MODE_OPTIONS = [
  { value: "in_person", label: "In person" },
  { value: "phone", label: "Phone" },
  { value: "video", label: "Video call" },
];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function HrInterviewsPage() {
  const [msg, setMsg] = useState("");
  const candidates = useHrOptions(
    "candidates",
    () => api.listHrCandidates(),
    (c) => ({ value: c.id, label: c.full_name }),
  );

  const setStatus = async (row: HrInterviewResponse, status: "completed" | "cancelled", refresh: () => Promise<void>) => {
    if (status === "cancelled" && !window.confirm(`Cancel the interview with ${candidates.labelOf(row.candidate_id)}?`)) return;
    setMsg("");
    try {
      await api.postHrInterviewStatus(row.id, { status });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update the interview");
    }
  };

  return (
    <HrSimpleCrudPage<HrInterviewResponse, HrInterviewCreate>
      title="Interviews"
      description="Schedule interviews and record whether they took place."
      emptyMessage="No interviews found."
      emptyHint="Schedule an interview for a candidate."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Interviews" }]}
      loadItems={() => api.listHrInterviews()}
      createItem={(p) =>
        api.createHrInterview({
          ...p,
          interviewer_employee_id: p.interviewer_employee_id || null,
          mode: p.mode || null,
          location: p.location?.trim() || null,
        })
      }
      createLabel="Schedule interview"
      exportFileName="interviews"
      initialForm={{
        candidate_id: 0,
        scheduled_at: "",
        interviewer_employee_id: null,
        mode: "",
        location: "",
      }}
      fields={[
        { key: "candidate_id", label: "Candidate", type: "select", required: true, options: candidates.options },
        { key: "scheduled_at", label: "Date and time", type: "datetime-local", required: true },
        { key: "interviewer_employee_id", label: "Interviewer", type: "employee" },
        { key: "mode", label: "Mode", type: "select", options: MODE_OPTIONS },
        { key: "location", label: "Location / meeting link", type: "text" },
      ]}
      columns={[
        { header: "Candidate", cell: (row) => candidates.labelOf(row.candidate_id) },
        { header: "When", cell: (row) => formatDateTime(row.scheduled_at) },
        { header: "Interviewer", cell: (row) => row.interviewer_employee_id, kind: "employee", hideOnMobile: true },
        { header: "Mode", cell: (row) => MODE_OPTIONS.find((m) => m.value === row.mode)?.label ?? row.mode, hideOnMobile: true },
        { header: "Status", cell: (row) => row.status, kind: "status" },
      ]}
      rowActions={(row, { refresh }) =>
        row.status === "scheduled"
          ? [
              { key: "done", label: "Completed", primary: true, tone: "positive", onClick: () => void setStatus(row, "completed", refresh) },
              { key: "cancel", label: "Cancel interview", danger: true, onClick: () => void setStatus(row, "cancelled", refresh) },
            ]
          : []
      }
      footer={
        msg ? (
          <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
            {msg}
          </div>
        ) : null
      }
    />
  );
}
