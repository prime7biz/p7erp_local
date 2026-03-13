import { api, type HrRosterEntryCreate, type HrRosterEntryResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrRosterPage() {
  return (
    <HrSimpleCrudPage<HrRosterEntryResponse, HrRosterEntryCreate>
      title="HR Roster"
      description="Assign employees to shifts by day."
      emptyMessage="No roster entries found."
      loadItems={() => api.listHrRosterEntries()}
      createItem={(payload) => api.createHrRosterEntry(payload)}
      createLabel="Add roster entry"
      initialForm={{
        employee_id: 0,
        roster_date: "",
        shift_id: null,
        note: "",
      }}
      fields={[
        { key: "employee_id", label: "Employee ID", type: "number", required: true },
        { key: "roster_date", label: "Roster Date", type: "date", required: true },
        { key: "shift_id", label: "Shift ID", type: "number" },
      ]}
      columns={[
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Date", cell: (row) => row.roster_date },
        { header: "Shift ID", cell: (row) => row.shift_id },
        { header: "Note", cell: (row) => row.note },
      ]}
    />
  );
}
