import { useState } from "react";
import { api, type HrReviewCreate, type HrReviewResponse } from "@/api/client";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

const rating = (v: number | null | undefined) => (v == null ? "-" : `${v} / 5`);

/** Empty box = no rating; 0 is a valid rating (backend accepts 0–5). */
function ratingOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function HrReviewsPage() {
  const [msg, setMsg] = useState("");
  const cycles = useHrOptions(
    "performanceCycles",
    () => api.listHrPerformanceCycles(),
    (c) => ({ value: c.id, label: c.name }),
  );

  const submit = async (row: HrReviewResponse, refresh: () => Promise<void>) => {
    setMsg("");
    try {
      await api.submitHrReview(row.id);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not submit the review");
    }
  };

  return (
    <HrSimpleCrudPage<HrReviewResponse, HrReviewCreate>
      title="Performance Reviews"
      description="Rate employees for a performance cycle (0 to 5) and submit the review when it is final."
      emptyMessage="No reviews found."
      emptyHint="Create a performance cycle first (Cycles tab), then add a review for each employee."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Reviews" }]}
      loadItems={() => api.listHrReviews()}
      createItem={(p) =>
        api.createHrReview({
          ...p,
          reviewer_employee_id: p.reviewer_employee_id || null,
          self_rating: ratingOrNull(p.self_rating),
          manager_rating: ratingOrNull(p.manager_rating),
          employee_comment: p.employee_comment?.trim() || null,
          manager_comment: p.manager_comment?.trim() || null,
        })
      }
      createLabel="Add review"
      exportFileName="performance-reviews"
      initialForm={{
        cycle_id: 0,
        employee_id: 0,
        reviewer_employee_id: null,
        self_rating: null,
        manager_rating: null,
        employee_comment: "",
        manager_comment: "",
      }}
      fields={[
        { key: "cycle_id", label: "Performance cycle", type: "select", required: true, options: cycles.options },
        { key: "employee_id", label: "Employee", type: "employee", required: true },
        { key: "reviewer_employee_id", label: "Reviewer", type: "employee" },
        { key: "self_rating", label: "Self rating (0–5)", type: "number" },
        { key: "manager_rating", label: "Manager rating (0–5)", type: "number" },
        { key: "employee_comment", label: "Employee comment", type: "textarea" },
        { key: "manager_comment", label: "Manager comment", type: "textarea" },
      ]}
      columns={[
        { header: "Employee", cell: (row) => row.employee_id, kind: "employee" },
        { header: "Cycle", cell: (row) => cycles.labelOf(row.cycle_id) },
        { header: "Reviewer", cell: (row) => row.reviewer_employee_id, kind: "employee", hideOnMobile: true },
        { header: "Manager rating", cell: (row) => rating(row.manager_rating) },
        { header: "Final", cell: (row) => rating(row.final_rating), hideOnMobile: true },
        { header: "Status", cell: (row) => row.status, kind: "status" },
      ]}
      rowActions={(row, { refresh }) =>
        row.submitted_at ? [] : [{ key: "submit", label: "Submit", primary: true, onClick: () => void submit(row, refresh) }]
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
