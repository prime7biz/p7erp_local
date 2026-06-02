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

// Keep in sync with backend `ORDER_TRANSITIONS` in `app/common/workflow.py`.
export const ORDER_TRANSITIONS: TransitionMap = {
  DRAFT: ["NEW", "CONFIRMED", "CANCELLED"],
  NEW: ["CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  IN_PROGRESS: ["CANCELLED"],
  COMPLETED: ["CANCELLED"],
  CANCELLED: ["NEW"],
};

/** Full order execution pipeline (matches backend `PIPELINE_STAGES`). */
export const PIPELINE_STAGES = [
  "INQUIRY",
  "QUOTATION",
  "ORDER_CONFIRMED",
  "PI_ISSUED",
  "LC_RECEIVED",
  "BOM_CREATED",
  "PO_ISSUED",
  "RM_RECEIVED",
  "IN_PRODUCTION",
  "SHIPPED",
  "PAYMENT_RECEIVED",
  "COMPLETED",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_NA_PRESETS: Record<string, string[]> = {
  local: ["LC_RECEIVED"],
  export: [],
  both: [],
};

export function suggestNaSteps(orderType: string | undefined): string[] {
  const k = (orderType || "export").toLowerCase();
  return [...(PIPELINE_NA_PRESETS[k] ?? PIPELINE_NA_PRESETS.both ?? [])];
}

export function humanizePipelineStatus(status: string): string {
  return humanizeStatus(status);
}

/** Lifecycle stages that are advanced automatically (manual column is limited to cancel / draft setup). */
export function isPipelineAutoStatus(status: string | undefined): boolean {
  const s = normalizeStatus(status, "NEW");
  return s !== "DRAFT" && s !== "CANCELLED";
}

export const INQUIRY_STATUS_FILTER_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "CONVERTED",
  "LOST",
  "CANCELLED",
] as const;

/**
 * Inquiry list row colors (standard per status, design tokens).
 * DRAFT: default neutral · SUBMITTED: info blue · CONVERTED: success green · LOST: warning amber · CANCELLED: danger red
 */
export function inquiryListRowPrimaryTextClass(status: string | undefined): string {
  const s = normalizeStatus(status, "DRAFT");
  if (s === "SUBMITTED") return "font-medium text-status-info-foreground";
  if (s === "CONVERTED") return "font-medium text-status-success-foreground";
  if (s === "LOST") return "font-medium text-status-warning-foreground";
  if (s === "CANCELLED") return "font-medium text-status-danger-foreground";
  return "font-medium text-text-primary";
}

export function inquiryListRowSecondaryTextClass(status: string | undefined): string {
  const s = normalizeStatus(status, "DRAFT");
  if (s === "SUBMITTED") return "text-status-info-foreground/90";
  if (s === "CONVERTED") return "text-status-success-foreground/90";
  if (s === "LOST") return "text-status-warning-foreground/90";
  if (s === "CANCELLED") return "text-status-danger-foreground/90";
  return "text-text-secondary";
}

export function inquiryListRowTertiaryTextClass(status: string | undefined): string {
  const s = normalizeStatus(status, "DRAFT");
  if (s === "SUBMITTED") return "text-xs text-status-info-foreground/75";
  if (s === "CONVERTED") return "text-xs text-status-success-foreground/75";
  if (s === "LOST") return "text-xs text-status-warning-foreground/75";
  if (s === "CANCELLED") return "text-xs text-status-danger-foreground/75";
  return "text-xs text-text-muted";
}

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

export function canSubmitInquiry(currentStatus: string | undefined): boolean {
  return getNextStatuses(INQUIRY_TRANSITIONS, currentStatus, "DRAFT").includes("SUBMITTED");
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

/** Inquiries still available to link on the new-quotation form (not closed and not already tied to a quotation). */
export function isInquiryOpenForQuotationLink(inquiry: {
  status: string;
  is_converted_to_quotation?: boolean;
}): boolean {
  const s = normalizeStatus(inquiry.status, "DRAFT");
  if (s === "CONVERTED" || s === "LOST" || s === "CANCELLED") return false;
  return !inquiry.is_converted_to_quotation;
}

/** Quotations still available to link on the new-order form (no order yet; not a closed quotation status). */
export function isQuotationOpenForOrderLink(quotation: {
  status: string;
  is_converted_to_order?: boolean;
}): boolean {
  if (quotation.is_converted_to_order) return false;
  const s = normalizeStatus(quotation.status, "DRAFT");
  return s === "SENT";
}

