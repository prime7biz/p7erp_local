import { api, type HrReviewCreate, type HrReviewResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrReviewsPage() {
  return (
    <HrSimpleCrudPage<HrReviewResponse, HrReviewCreate>
      title="Performance Reviews"
      description="Capture review cycle scores and reviewer comments."
      emptyMessage="No reviews found."
      loadItems={() => api.listHrReviews()}
      createItem={(payload) => api.createHrReview(payload)}
      createLabel="Add review"
      initialForm={{
        employee_id: 0,
        reviewer_employee_id: null,
        review_period: "",
        overall_rating: 0,
        comments: "",
      }}
      fields={[
        { key: "employee_id", label: "Employee ID", type: "number", required: true },
        { key: "reviewer_employee_id", label: "Reviewer Employee ID", type: "number" },
        { key: "review_period", label: "Review Period", type: "text", required: true },
        { key: "overall_rating", label: "Overall Rating", type: "number", required: true },
      ]}
      columns={[
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Reviewer ID", cell: (row) => row.reviewer_employee_id },
        { header: "Period", cell: (row) => row.review_period },
        { header: "Rating", cell: (row) => row.overall_rating },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
