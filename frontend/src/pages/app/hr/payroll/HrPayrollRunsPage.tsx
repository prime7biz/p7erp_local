import { api, type HrPayrollRunCreate, type HrPayrollRunResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrPayrollRunsPage() {
  return (
    <HrSimpleCrudPage<HrPayrollRunResponse, HrPayrollRunCreate>
      title="Payroll Runs"
      description="Generate payroll runs by payroll period."
      emptyMessage="No payroll runs found."
      loadItems={() => api.listHrPayrollRuns()}
      createItem={(payload) => api.createHrPayrollRun(payload)}
      createLabel="Create payroll run"
      initialForm={{
        payroll_period_id: 0,
        run_code: "",
        run_date: "",
      }}
      fields={[
        { key: "payroll_period_id", label: "Payroll Period ID", type: "number", required: true },
        { key: "run_code", label: "Run Code", type: "text", required: true },
        { key: "run_date", label: "Run Date", type: "date", required: true },
      ]}
      columns={[
        { header: "Run Code", cell: (row) => row.run_code },
        { header: "Period ID", cell: (row) => row.payroll_period_id },
        { header: "Run Date", cell: (row) => row.run_date },
        { header: "Status", cell: (row) => row.status },
        { header: "Employees", cell: (row) => row.total_employees },
        { header: "Net Payable", cell: (row) => row.net_payable },
      ]}
    />
  );
}
