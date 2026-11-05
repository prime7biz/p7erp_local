import type { RequisitionStatus } from "@/api/client";
import { REQUISITION_STATUS_LABEL, REQUISITION_STATUS_TONE } from "./requisitionStatus";

export function RequisitionStatusBadge({ status }: { status: RequisitionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQUISITION_STATUS_TONE[status] ?? ""}`}>
      {REQUISITION_STATUS_LABEL[status] ?? status}
    </span>
  );
}
