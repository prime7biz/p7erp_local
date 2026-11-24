/** Plain-English labels for common audit actions shown on User Activity. */

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  LOGIN_FAILED: "Wrong password attempt",
  LOGIN_LOCKED: "Account locked",
  LOGIN_BLOCKED_IP: "Login blocked (IP lock)",
  STAFF_INVITE_ACCEPTED: "Staff invite accepted",
  PASSWORD_RESET_REQUESTED: "Password reset requested",
  PASSWORD_RESET_COMPLETED: "Password reset completed",
  PASSWORD_CHANGED: "Password changed",
  SETTINGS_USER_SIGN_OUT_DEVICES: "Signed out of devices",
  REPORT_VIEWED: "Opened a report",
  REPORT_EXPORTED: "Exported a report",
  ORDER_CREATED: "Order created",
  ORDER_UPDATED: "Order updated",
  ORDER_STATUS_CHANGED: "Order status changed",
  ORDER_DELETED: "Order deleted",
  INQUIRY_CREATED: "Inquiry created",
  INQUIRY_STATUS_CHANGED: "Inquiry status changed",
  INQUIRY_DELETED: "Inquiry deleted",
  QUOTATION_CREATED: "Quotation created",
  QUOTATION_STATUS_CHANGED: "Quotation status changed",
  BOM_SUBMITTED: "BOM submitted",
  BOM_APPROVED: "BOM approved",
  BOM_REJECTED: "BOM rejected",
  BOM_FROZEN: "BOM frozen",
  EXPORT_CASE_CREATED: "Export case created",
  EXPORT_CASE_UPDATED: "Export case updated",
  MASTER_CONTRACT_CREATED: "Sales contract / LC created",
  MASTER_CONTRACT_UPDATED: "Sales contract / LC updated",
  MASTER_CONTRACT_STATUS_CHANGED: "Sales contract / LC status changed",
  PROFORMA_CREATED: "Proforma invoice created",
  PROFORMA_DELETED: "Proforma invoice deleted",
  BTB_LC_CREATED: "BTB LC created",
  PO_CLASS1_APPROVED: "Purchase order Class 1 approved",
  PO_CLASS1_REJECTED: "Purchase order Class 1 rejected",
  "purchase_order.created": "Purchase order created",
  "purchase_order.status": "Purchase order status changed",
  "goods_receiving.created": "GRN created",
  "goods_receiving.received": "GRN received into stock",
  "warehouse_transfer.created": "Warehouse transfer created",
  "warehouse_transfer.posted": "Warehouse transfer posted",
  "stock_adjustment.created": "Stock adjustment created",
  "stock_adjustment.posted": "Stock adjustment posted",
  "delivery_challan.created": "Delivery challan created",
  "delivery_challan.posted": "Delivery challan posted",
  "gate_pass.created": "Gate pass created",
  "gate_pass.released": "Gate pass released",
  "production_material_issue.posted": "Production material issue posted",
  "process_order.created": "Process order created",
  "process_order.issued": "Process order issued",
  "process_order.received": "Process order received",
  "voucher.created": "Voucher created",
  "voucher.status": "Voucher workflow step",
  "voucher.class1_approve": "Voucher Class 1 approved",
  "voucher.class1_reject": "Voucher Class 1 rejected",
  "voucher.cancel_posting": "Voucher posting cancelled",
  "voucher.reverse": "Voucher reversed",
  API_REQUEST: "API request",
  API_ERROR: "API error",
};

export function actionLabel(action: string | null | undefined): string {
  const key = (action || "").trim();
  if (!key) return "—";
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  if (key.startsWith("voucher.")) {
    return `Voucher ${key.slice("voucher.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("purchase_order.")) {
    return `Purchase order ${key.slice("purchase_order.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("goods_receiving.")) {
    return `GRN ${key.slice("goods_receiving.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("warehouse_transfer.")) {
    return `Warehouse transfer ${key.slice("warehouse_transfer.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("stock_adjustment.")) {
    return `Stock adjustment ${key.slice("stock_adjustment.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("delivery_challan.")) {
    return `Delivery challan ${key.slice("delivery_challan.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("gate_pass.")) {
    return `Gate pass ${key.slice("gate_pass.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("production_material_issue.")) {
    return `Production material issue ${key.slice("production_material_issue.".length).replaceAll("_", " ")}`;
  }
  if (key.startsWith("process_order.")) {
    return `Process order ${key.slice("process_order.".length).replaceAll("_", " ")}`;
  }
  return key.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

const IMPERSONATION_RE = /impersonated_by_platform_admin=(\d+)/i;

export function parseImpersonation(details: string | null | undefined): {
  isImpersonated: boolean;
  adminId: number | null;
  cleanDetails: string;
} {
  const raw = details ?? "";
  const match = raw.match(IMPERSONATION_RE);
  if (!match) {
    return { isImpersonated: false, adminId: null, cleanDetails: raw.trim() || "—" };
  }
  const adminId = Number(match[1]);
  const cleaned = raw
    .replace(/\s*\[impersonated_by_platform_admin=\d+\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    isImpersonated: true,
    adminId: Number.isFinite(adminId) ? adminId : null,
    cleanDetails: cleaned || "—",
  };
}

export function displayUserName(row: {
  full_name?: string | null;
  username?: string | null;
  user_id?: number | null;
}): string {
  const full = (row.full_name || "").trim();
  const username = (row.username || "").trim();
  if (full && username) return `${full} (@${username})`;
  if (full) return full;
  if (username) return `@${username}`;
  if (row.user_id != null) return `User #${row.user_id}`;
  return "Unknown user";
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const END_REASON_LABELS: Record<string, string> = {
  logout: "Signed out",
  superseded: "Replaced by newer login",
  signed_out_by_admin: "Signed out by admin",
  signed_out_by_user: "Signed out other devices",
  password_reset: "Password reset",
  authority_changed: "Authority changed",
  expired: "Expired (idle)",
};

export function endedReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—";
  return END_REASON_LABELS[reason] ?? reason;
}
