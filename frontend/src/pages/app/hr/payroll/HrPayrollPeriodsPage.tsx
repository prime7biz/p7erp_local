import { api, type HrPayrollPeriodCreate, type HrPayrollPeriodResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrPayrollPeriodsPage() {
  return (
    <HrSimpleCrudPage<HrPayrollPeriodResponse, HrPayrollPeriodCreate>
      title="Payroll Periods"
      description="Define payroll period calendar for salary processing."
      emptyMessage="No payroll periods found."
      loadItems={() => api.listHrPayrollPeriods()}
      createItem={(payload) => api.createHrPayrollPeriod(payload)}
      createLabel="Add payroll period"
      initialForm={{
        code: "",
        period_start: "",
        period_end: "",
      }}
      fields={[
        { key: "code", label: "Code", type: "text", required: true },
        { key: "period_start", label: "Start Date", type: "date", required: true },
        { key: "period_end", label: "End Date", type: "date", required: true },
      ]}
      columns={[
        { header: "Code", cell: (row) => row.code },
        { header: "Start", cell: (row) => row.period_start },
        { header: "End", cell: (row) => row.period_end },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}
