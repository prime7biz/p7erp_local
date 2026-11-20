export const VOUCHER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "CHECKED",
  "RECOMMENDED",
  "APPROVED",
  "POSTED",
  "REJECTED",
  "CANCELLED",
  "REVERSED",
] as const;

export const ACTION_TO_STATUS: Record<string, string> = {
  submit: "SUBMITTED",
  check: "CHECKED",
  recommend: "RECOMMENDED",
  approve: "APPROVED",
  reject: "REJECTED",
  set_draft: "DRAFT",
  cancel: "CANCELLED",
};

export const ACTION_LABEL: Record<string, string> = {
  submit: "Submit",
  check: "Check / Verify",
  recommend: "Recommend",
  approve: "Approve",
  post: "Post",
  reject: "Reject",
  set_draft: "Set Draft",
  cancel: "Cancel",
  reverse: "Reverse",
  cancel_posting: "Cancel posting",
  class1_approve: "Class 1 approve (audit-ready)",
  class1_reject: "Class 1 reject (reverse)",
};

export const ACTIONS_NEEDING_REASON = new Set([
  "reject",
  "cancel",
  "reverse",
  "cancel_posting",
  "class1_reject",
]);

export function class1ApprovalLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === "PENDING_CLASS1") return "Pending Class 1 approval";
  if (s === "APPROVED") return "Approved (audit-ready)";
  if (s === "REJECTED") return "Rejected / reversed";
  return status;
}

/** Approval chain in order; mirrors the backend voucher status transitions. */
export const VOUCHER_WORKFLOW_STEPS = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED"] as const;

/** Statuses still waiting for a reviewer (the classic approval queue). */
export const VOUCHER_PENDING_APPROVAL_STATUSES = ["SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED"] as const;

export const VOUCHER_NEXT_STEP_LABEL: Record<string, string> = {
  DRAFT: "Preparer to submit",
  SUBMITTED: "Waiting for Check",
  CHECKED: "Waiting for Recommend",
  RECOMMENDED: "Waiting for Approve",
  APPROVED: "Waiting for Post",
  POSTED: "Done (in books)",
  REJECTED: "Returned to preparer",
  CANCELLED: "Closed",
  REVERSED: "Closed",
};
