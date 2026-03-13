import { api, type HrSalaryStructureCreate, type HrSalaryStructureResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrSalaryStructuresPage() {
  return (
    <HrSimpleCrudPage<HrSalaryStructureResponse, HrSalaryStructureCreate>
      title="Salary Structures"
      description="Maintain grade-wise salary component templates."
      emptyMessage="No salary structures found."
      loadItems={() => api.listHrSalaryStructures({ active_only: false })}
      createItem={(payload) => api.createHrSalaryStructure(payload)}
      createLabel="Add salary structure"
      initialForm={{
        name: "",
        grade: "",
        basic_amount: 0,
        house_rent_amount: 0,
        medical_amount: 0,
        transport_amount: 0,
        is_active: true,
      }}
      fields={[
        { key: "name", label: "Name", type: "text", required: true },
        { key: "grade", label: "Grade", type: "text" },
        { key: "basic_amount", label: "Basic Amount", type: "number", required: true },
        { key: "house_rent_amount", label: "House Rent", type: "number" },
        { key: "medical_amount", label: "Medical", type: "number" },
        { key: "transport_amount", label: "Transport", type: "number" },
      ]}
      columns={[
        { header: "Name", cell: (row) => row.name },
        { header: "Grade", cell: (row) => row.grade },
        { header: "Basic", cell: (row) => row.basic_amount },
        { header: "House Rent", cell: (row) => row.house_rent_amount },
        { header: "Medical", cell: (row) => row.medical_amount },
        { header: "Transport", cell: (row) => row.transport_amount },
      ]}
    />
  );
}
