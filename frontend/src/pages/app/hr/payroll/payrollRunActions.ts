import type { HrRowAction } from "@/components/hr/kit/rowActions";

export type PayrollRunActionKey = "autocalc" | "finalize" | "approve" | "post" | "payslips" | "bank";

/**
 * Which actions are enabled for a run status. These mirror the backend checks in
 * hr_payroll/router.py (finalize, approve, post, generate-payslips); the server stays authoritative.
 */
export function isPayrollRunActionEnabled(key: PayrollRunActionKey, status: string): boolean {
  switch (key) {
    case "autocalc":
    case "finalize":
      return ["DRAFT", "CHECKED", "REJECTED"].includes(status);
    case "approve":
      return ["FINALIZED", "CHECKED"].includes(status);
    case "post":
    case "payslips":
    case "bank":
      return ["APPROVED", "POSTED"].includes(status);
  }
}

/** The (at most two) next steps shown as buttons; everything else stays in the Actions menu. */
const VISIBLE_BY_STATUS: Record<string, PayrollRunActionKey[]> = {
  DRAFT: ["autocalc", "finalize"],
  REJECTED: ["autocalc", "finalize"],
  CHECKED: ["finalize", "approve"],
  FINALIZED: ["approve"],
  APPROVED: ["post", "payslips"],
  POSTED: ["payslips", "bank"],
};

const LABELS: Record<PayrollRunActionKey, string> = {
  autocalc: "Auto-calculate",
  finalize: "Finalize",
  approve: "Approve",
  post: "Post GL",
  payslips: "Payslips",
  bank: "Bank CSV",
};

const ORDER: PayrollRunActionKey[] = ["autocalc", "finalize", "approve", "post", "payslips", "bank"];

export function payrollRunRowActions(
  status: string,
  onAction: (key: PayrollRunActionKey) => void,
  busy: boolean,
): HrRowAction[] {
  const visible = VISIBLE_BY_STATUS[status] ?? [];
  const actions = ORDER.map<HrRowAction>((key) => ({
    key,
    label: LABELS[key],
    primary: visible.includes(key),
    tone: key === "approve" ? "positive" : "neutral",
    disabled: busy || !isPayrollRunActionEnabled(key, status),
    onClick: () => onAction(key),
  }));
  // Visible buttons first, in the order above; the rest keep their order inside the menu.
  return [...actions.filter((a) => a.primary), ...actions.filter((a) => !a.primary)];
}
