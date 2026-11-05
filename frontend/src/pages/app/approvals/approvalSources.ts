/**
 * Non-finance sources for the unified approval inbox (Akij-style "one inbox"):
 * purchase orders, purchase requisitions, BOMs, leave requests and payroll runs.
 *
 * Each loader swallows its own error (logged) so one module being off or forbidden
 * never empties the whole inbox.
 */
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export type OpsDocType = "PURCHASE_ORDER" | "REQUISITION" | "BOM" | "LEAVE" | "PAYROLL_RUN";

export type OpsApprovalRow = {
  doc_type: OpsDocType;
  id: number;
  number: string;
  date: string;
  status: string;
  amount: number | null;
  details: string;
  actions: string[];
  href: string;
};

/** Actions that must collect a reason before running. */
export const OPS_REASON_ACTIONS = new Set(["reject", "cancel"]);

export const OPS_DOC_LABEL: Record<OpsDocType, string> = {
  PURCHASE_ORDER: "Purchase Order",
  REQUISITION: "Requisition",
  BOM: "BOM",
  LEAVE: "Leave Request",
  PAYROLL_RUN: "Payroll Run",
};

async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    logApiError(`AllApprovalsPage.${label}`, e);
    return [];
  }
}

export async function loadOpsApprovals(opts: {
  canApprove: boolean;
  canApproveHr: boolean;
  requisitionsEnabled: boolean;
}): Promise<OpsApprovalRow[]> {
  const { canApprove, canApproveHr, requisitionsEnabled } = opts;
  const [pos, prs, boms, leaves, payrollPages] = await Promise.all([
    safe("purchaseOrders", async () => (await api.listPurchaseOrdersPaginated({ status_filter: "DRAFT", page: 1, page_size: 200 })).items),
    requisitionsEnabled ? safe("requisitions", async () => (await api.listRequisitions({ status: "SUBMITTED", limit: 200 })).rows) : Promise.resolve([]),
    safe("boms", async () => (await api.listBoms()).filter((b) => (b.status || "").toUpperCase() === "SUBMITTED")),
    safe("leave", () => api.listHrLeaveRequests({ status_filter: "PENDING" })),
    Promise.all(["FINALIZED", "CHECKED"].map((s) => safe(`payroll(${s})`, () => api.listHrPayrollRuns({ status_filter: s })))),
  ]);

  const rows: OpsApprovalRow[] = [];
  for (const po of pos) {
    rows.push({
      doc_type: "PURCHASE_ORDER",
      id: po.id,
      number: po.po_code,
      date: po.order_date ?? "",
      status: po.status,
      amount: po.base_total_amount != null ? Number(po.base_total_amount) : null,
      details: `${po.supplier_name}${po.currency ? ` | ${po.currency}` : ""} | ${po.items.length} line(s)`,
      actions: canApprove ? ["approve", "cancel"] : [],
      href: "/app/inventory/purchase-orders",
    });
  }
  for (const pr of prs) {
    rows.push({
      doc_type: "REQUISITION",
      id: pr.id,
      number: pr.pr_code,
      date: pr.created_at?.slice(0, 10) ?? "",
      status: pr.status,
      amount: null,
      details: [pr.department, pr.purpose, pr.required_date ? `needed ${pr.required_date}` : null].filter(Boolean).join(" | ") || "—",
      actions: canApprove ? ["approve", "reject"] : [],
      href: `/app/procurement/requisitions/${pr.id}`,
    });
  }
  for (const b of boms) {
    rows.push({
      doc_type: "BOM",
      id: b.id,
      number: `BOM #${b.id} v${b.version_no}`,
      date: b.updated_at?.slice(0, 10) ?? "",
      status: b.status,
      amount: null,
      details: `Style #${b.style_id}${b.notes ? ` | ${b.notes}` : ""}`,
      actions: canApprove ? ["approve"] : [],
      href: "/app/bom",
    });
  }
  for (const lv of leaves) {
    rows.push({
      doc_type: "LEAVE",
      id: lv.id,
      number: `Leave #${lv.id}`,
      date: lv.from_date,
      status: lv.status,
      amount: null,
      details: `Employee #${lv.employee_id} | ${lv.from_date} → ${lv.to_date} (${lv.days_requested} day(s))${lv.reason ? ` | ${lv.reason}` : ""}`,
      actions: canApproveHr ? ["approve", "reject"] : [],
      href: "/app/hr/leave/approvals",
    });
  }
  for (const run of payrollPages.flat()) {
    rows.push({
      doc_type: "PAYROLL_RUN",
      id: run.id,
      number: run.run_code,
      date: run.run_date,
      status: run.status,
      amount: Number(run.net_total),
      details: `Gross ${run.gross_total} | Deductions ${run.deduction_total}`,
      actions: canApproveHr ? ["approve", "reject"] : [],
      href: "/app/hr/payroll/approvals",
    });
  }
  return rows;
}

export async function runOpsAction(row: OpsApprovalRow, action: string, reason: string): Promise<void> {
  switch (row.doc_type) {
    case "PURCHASE_ORDER":
      if (action === "approve") await api.updatePurchaseOrderStatus(row.id, "APPROVED");
      else if (action === "cancel") await api.updatePurchaseOrderStatus(row.id, "CANCELLED", reason);
      else throw new Error(`Unsupported action: ${action}`);
      return;
    case "REQUISITION":
      if (action === "approve") await api.setRequisitionStatus(row.id, "APPROVED");
      else if (action === "reject") await api.setRequisitionStatus(row.id, "REJECTED", reason);
      else throw new Error(`Unsupported action: ${action}`);
      return;
    case "BOM":
      if (action === "approve") await api.approveBom(row.id);
      else throw new Error(`Unsupported action: ${action}`);
      return;
    case "LEAVE":
      if (action === "approve") await api.decideHrLeaveRequest(row.id, "approved");
      else if (action === "reject") await api.decideHrLeaveRequest(row.id, "rejected", reason);
      else throw new Error(`Unsupported action: ${action}`);
      return;
    case "PAYROLL_RUN":
      if (action === "approve") await api.approveHrPayrollRun(row.id);
      else if (action === "reject") await api.rejectHrPayrollRun(row.id, { note: reason });
      else throw new Error(`Unsupported action: ${action}`);
      return;
  }
}
