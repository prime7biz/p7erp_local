import { api, type HrPayslipResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrMyPayslipFilter {
  year: number;
}

export function HrMyPayslipsPage() {
  return (
    <HrSimpleCrudPage<HrPayslipResponse, HrMyPayslipFilter>
      title="My Payslips"
      description="View your generated payslips."
      emptyMessage="No payslips found."
      loadItems={() => api.listHrEssMyPayslips()}
      columns={[
        { header: "Payroll Run ID", cell: (row) => row.payroll_run_id },
        { header: "Gross", cell: (row) => row.gross_amount },
        { header: "Deduction", cell: (row) => row.deduction_amount },
        { header: "Net", cell: (row) => row.net_amount },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
