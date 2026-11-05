import type { RequisitionStatus } from "@/api/client";

export const REQUISITION_STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved — collecting quotations",
  REJECTED: "Rejected",
  CS_SELECTED: "Supplier selected",
  PO_CREATED: "PO created",
  CANCELLED: "Cancelled",
};

export const REQUISITION_STATUS_TONE: Record<RequisitionStatus, string> = {
  DRAFT: "bg-surface-subtle text-text-secondary",
  SUBMITTED: "bg-status-info-subtle text-status-info-foreground",
  APPROVED: "bg-status-info-subtle text-status-info-foreground",
  REJECTED: "bg-status-danger-subtle text-status-danger-foreground",
  CS_SELECTED: "bg-status-warning-subtle text-status-warning-foreground",
  PO_CREATED: "bg-status-success-subtle text-status-success-foreground",
  CANCELLED: "bg-surface-subtle text-text-muted",
};
