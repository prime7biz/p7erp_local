type TransitionMap = Record<string, string[]>;

export const INQUIRY_TRANSITIONS: TransitionMap = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["CONVERTED", "LOST", "CANCELLED"],
  CONVERTED: [],
  LOST: [],
  CANCELLED: [],
};

export const QUOTATION_TRANSITIONS: TransitionMap = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  NEW: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SENT", "REJECTED", "CANCELLED"],
  SENT: ["CONVERTED", "REJECTED", "CANCELLED"],
  CONVERTED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const ORDER_TRANSITIONS: TransitionMap = {
  DRAFT: ["NEW", "CANCELLED"],
  NEW: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const INQUIRY_STATUS_FILTER_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "CONVERTED",
  "LOST",
  "CANCELLED",
] as const;

export const QUOTATION_STATUS_FILTER_OPTIONS = [
  "DRAFT",
  "NEW",
  "SUBMITTED",
  "APPROVED",
  "SENT",
  "CONVERTED",
  "REJECTED",
  "CANCELLED",
] as const;

function normalizeStatus(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toUpperCase();
}

function getNextStatuses(
  transitions: TransitionMap,
  currentStatus: string | undefined,
  fallback: string
): string[] {
  const current = normalizeStatus(currentStatus, fallback);
  return transitions[current] ?? [];
}

export function getOrderStatusChoices(currentStatus: string | undefined): string[] {
  const current = normalizeStatus(currentStatus, "DRAFT");
  const next = getNextStatuses(ORDER_TRANSITIONS, currentStatus, "DRAFT");
  return [current, ...next];
}

export function canConvertInquiryToQuotation(currentStatus: string | undefined): boolean {
  return getNextStatuses(INQUIRY_TRANSITIONS, currentStatus, "DRAFT").includes("CONVERTED");
}

export function canConvertQuotationToOrder(currentStatus: string | undefined): boolean {
  return getNextStatuses(QUOTATION_TRANSITIONS, currentStatus, "DRAFT").includes("CONVERTED");
}

export function getQuotationWorkflowAction(
  currentStatus: string | undefined
): { label: string; action: "submit" | "approve" | "send" } | null {
  const next = getNextStatuses(QUOTATION_TRANSITIONS, currentStatus, "DRAFT");
  if (next.includes("SUBMITTED")) {
    return { label: "Submit", action: "submit" };
  }
  if (next.includes("APPROVED")) {
    return { label: "Approve", action: "approve" };
  }
  if (next.includes("SENT")) {
    return { label: "Send", action: "send" };
  }
  return null;
}

export function humanizeStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

