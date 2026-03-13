import { api, type HrPayslipResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrPayslipFilter {
  run_id: number;
}

export function HrPayslipsPage() {
  return (
    <HrSimpleCrudPage<HrPayslipResponse, HrPayslipFilter>
      title="Payslips"
      description="Review generated payslips and net payment values."
      emptyMessage="No payslips found."
      loadItems={() => api.listHrPayslips()}
      columns={[
        { header: "Payroll Run ID", cell: (row) => row.payroll_run_id },
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Gross", cell: (row) => row.gross_amount },
        { header: "Deductions", cell: (row) => row.deduction_amount },
        { header: "Net", cell: (row) => row.net_amount },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
