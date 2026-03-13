import { api, type HrGoalCreate, type HrGoalResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrGoalsPage() {
  return (
    <HrSimpleCrudPage<HrGoalResponse, HrGoalCreate>
      title="Performance Goals"
      description="Create goals and track progress for each employee."
      emptyMessage="No goals found."
      loadItems={() => api.listHrGoals()}
      createItem={(payload) => api.createHrGoal(payload)}
      createLabel="Add goal"
      initialForm={{
        employee_id: 0,
        title: "",
        description: "",
        target_date: "",
      }}
      fields={[
        { key: "employee_id", label: "Employee ID", type: "number", required: true },
        { key: "title", label: "Goal Title", type: "text", required: true },
        { key: "target_date", label: "Target Date", type: "date" },
      ]}
      columns={[
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Title", cell: (row) => row.title },
        { header: "Target Date", cell: (row) => row.target_date },
        { header: "Status", cell: (row) => row.status },
        { header: "Progress %", cell: (row) => row.progress_percent },
      ]}
    />
  );
}
