import { api } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

const PREFIX = "/app/hr";

type AdvanceRow = Record<string, unknown>;

interface AdvanceForm {
  employee_id: number;
  amount: string;
  monthly_deduction: string;
  reason: string;
}

const num = (v: unknown) => (v == null || v === "" ? null : String(v));

export function HrPayrollAdvancesPage() {
  return (
    <HrSimpleCrudPage<AdvanceRow, AdvanceForm>
      title="Employee advances & loans"
      description="Track salary advances and loans with their planned monthly deduction and outstanding amount."
      emptyMessage="No advances or loans yet."
      emptyHint="Issue an advance when an employee needs part of the salary early."
      breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Advances" }]}
      loadItems={() => api.listHrPayrollAdvances()}
      createItem={(p) =>
        api.createHrPayrollAdvance({
          employee_id: p.employee_id,
          amount: p.amount,
          monthly_deduction: p.monthly_deduction,
          reason: p.reason.trim() || null,
        })
      }
      createLabel="Issue advance"
      exportFileName="advances"
      initialForm={{ employee_id: 0, amount: "", monthly_deduction: "", reason: "" }}
      fields={[
        { key: "employee_id", label: "Employee", type: "employee", required: true },
        { key: "amount", label: "Amount", type: "text", required: true, placeholder: "e.g. 10000" },
        { key: "monthly_deduction", label: "Monthly deduction", type: "text", required: true, placeholder: "e.g. 2000" },
        { key: "reason", label: "Reason", type: "textarea" },
      ]}
      columns={[
        { header: "Employee", cell: (r) => Number(r.employee_id), kind: "employee" },
        { header: "Amount", cell: (r) => num(r.amount), kind: "money" },
        { header: "Monthly deduction", cell: (r) => num(r.monthly_deduction), kind: "money", hideOnMobile: true },
        { header: "Outstanding", cell: (r) => num(r.outstanding), kind: "money" },
        { header: "Status", cell: (r) => (r.status == null ? null : String(r.status)), kind: "status" },
      ]}
    />
  );
}
