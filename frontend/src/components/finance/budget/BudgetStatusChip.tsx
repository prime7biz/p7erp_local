import type { BudgetStatus } from "@/api/financeBudgetAnalytics";
import { STATUS_CHIP, STATUS_LABEL } from "./budgetLogic";

/** Within / Warning / Over / Critical chip for a budget row. */
export function BudgetStatusChip({ status }: { status: BudgetStatus }) {
  return (
    <span
      data-testid={`status-${status}`}
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
