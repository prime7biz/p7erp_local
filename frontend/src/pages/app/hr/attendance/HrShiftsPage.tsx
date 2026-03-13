import { api, type HrShiftCreate, type HrShiftResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrShiftsPage() {
  return (
    <HrSimpleCrudPage<HrShiftResponse, HrShiftCreate>
      title="HR Shifts"
      description="Create shift templates used for roster and attendance."
      emptyMessage="No shifts found."
      loadItems={() => api.listHrShifts({ active_only: false })}
      createItem={(payload) => api.createHrShift(payload)}
      createLabel="Add shift"
      initialForm={{
        code: "",
        name: "",
        start_time: "",
        end_time: "",
        is_night_shift: false,
        is_active: true,
      }}
      fields={[
        { key: "code", label: "Code", type: "text", required: true },
        { key: "name", label: "Name", type: "text", required: true },
        { key: "start_time", label: "Start Time", type: "text", required: true },
        { key: "end_time", label: "End Time", type: "text", required: true },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.code },
        { header: "Name", cell: (row) => row.name },
        { header: "Start", cell: (row) => row.start_time },
        { header: "End", cell: (row) => row.end_time },
        { header: "Night Shift", cell: (row) => (row.is_night_shift ? "Yes" : "No") },
        { header: "Status", cell: (row) => (row.is_active ? "Active" : "Inactive") },
      ]}
    />
  );
}
