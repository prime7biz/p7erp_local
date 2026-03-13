import { api, type HrLeaveBalanceResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

interface HrLeaveBalancesFilter {
  year: number;
}

export function HrLeaveBalancesPage() {
  return (
    <HrSimpleCrudPage<HrLeaveBalanceResponse, HrLeaveBalancesFilter>
      title="Leave Balances"
      description="Track allocated, consumed, and remaining leave balances."
      emptyMessage="No leave balance records found."
      loadItems={() => api.listHrLeaveBalances()}
      columns={[
        { header: "Employee ID", cell: (row) => row.employee_id },
        { header: "Leave Type ID", cell: (row) => row.leave_type_id },
        { header: "Year", cell: (row) => row.year },
        { header: "Allocated", cell: (row) => row.allocated },
        { header: "Consumed", cell: (row) => row.consumed },
        { header: "Remaining", cell: (row) => row.remaining },
      ]}
    />
  );
}
