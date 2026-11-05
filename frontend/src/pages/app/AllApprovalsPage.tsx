import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type AccountingPeriodResponse,
  type BankReconciliationResponse,
  type PaymentRunResponse,
  type VoucherResponse,
} from "@/api/client";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";
import { resolveRole } from "@/lib/roles";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";
import {
  OPS_DOC_LABEL,
  OPS_REASON_ACTIONS,
  loadOpsApprovals,
  runOpsAction,
  type OpsApprovalRow,
  type OpsDocType,
} from "./approvals/approvalSources";

type FinanceDocType = "VOUCHER" | "PAYMENT_RUN" | "BANK_RECONCILIATION" | "ACCOUNTING_PERIOD";
type ApprovalDocType = "ALL" | FinanceDocType | OpsDocType;

type ApprovalRow = {
  doc_type: Exclude<ApprovalDocType, "ALL">;
  id: number;
  number: string;
  date: string;
  status: string;
  amount: number | null;
  details: string;
  actions: string[];
  href?: string;
};

function isOpsRow(row: ApprovalRow): row is OpsApprovalRow {
  return row.doc_type in OPS_DOC_LABEL;
}

const VOUCHER_QUEUE_STATUSES = ["SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED"];
const ACTION_TO_STATUS: Record<string, string> = {
  submit: "SUBMITTED",
  check: "CHECKED",
  recommend: "RECOMMENDED",
  approve: "APPROVED",
  reject: "REJECTED",
  set_draft: "DRAFT",
  cancel: "CANCELLED",
};

const ACTION_LABEL: Record<string, string> = {
  submit: "Submit",
  check: "Check",
  recommend: "Recommend",
  approve: "Approve",
  post: "Post",
  reject: "Reject",
  set_draft: "Set Draft",
  cancel: "Cancel",
  execute: "Execute",
  process: "Process",
  finalize: "Finalize",
  close: "Close",
  reopen: "Reopen",
};

const PRIVILEGED_ROLES = new Set(["admin", "manager", "owner", "super_admin", "superadmin"]);
const VOUCHER_PAGE_LIMIT = 500;
/** Backend caps POST /vouchers/available-actions-batch at 200 ids. */
const ACTIONS_BATCH_SIZE = 200;

function mapPaymentRunActions(status: string, canApproveOrProcess: boolean, canExecute: boolean): string[] {
  if (status === "DRAFT" && canApproveOrProcess) return ["approve"];
  if (status === "APPROVED" && canApproveOrProcess) return ["process"];
  if (status === "PROCESSED" && canExecute) return ["execute"];
  return [];
}

function mapReconciliationActions(recon: BankReconciliationResponse, canApproveOrProcess: boolean): string[] {
  if (!recon.is_finalized && canApproveOrProcess) return ["finalize"];
  return [];
}

function mapPeriodActions(period: AccountingPeriodResponse, canApproveOrProcess: boolean): string[] {
  if (!canApproveOrProcess) return [];
  return period.is_closed ? ["reopen"] : ["close"];
}

function docTypeLabel(type: ApprovalRow["doc_type"]) {
  if (type in OPS_DOC_LABEL) return OPS_DOC_LABEL[type as OpsDocType];
  if (type === "VOUCHER") return "Voucher";
  if (type === "PAYMENT_RUN") return "Payment Run";
  if (type === "BANK_RECONCILIATION") return "Bank Reconciliation";
  return "Accounting Period";
}

export function AllApprovalsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<ApprovalDocType>("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);
  const [reasonFor, setReasonFor] = useState<{ row: ApprovalRow; action: string } | null>(null);

  // Role comes from /auth/me; listing users needs settings access that finance users lack.
  const myRole = (me?.role_name ?? "").trim().toLowerCase();
  const canApproveOrProcess = PRIVILEGED_ROLES.has(myRole);
  const canExecute = canApproveOrProcess;
  const canApproveHr = canApproveOrProcess || resolveRole(me?.role_name).isHr;
  const requisitionsEnabled = me?.feature_flags?.procurement_cs_enabled === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const [voucherPages, runs, reconciliations, periods, opsRows] = await Promise.all([
        // One request per queue status so older pending vouchers are not cut off by the default page size.
        Promise.all(
          VOUCHER_QUEUE_STATUSES.map((s) =>
            api.listVouchersWithTotal({ status_filter: s, limit: VOUCHER_PAGE_LIMIT }).catch((e) => {
              logApiError(`AllApprovalsPage.vouchers(${s})`, e);
              return { rows: [] as VoucherResponse[], total: 0 };
            }),
          ),
        ),
        api.listPaymentRuns(),
        api.listBankReconciliations(),
        api.listAccountingPeriods(),
        loadOpsApprovals({ canApprove: canApproveOrProcess, canApproveHr, requisitionsEnabled }),
      ]);
      const queueVouchers = voucherPages.flatMap((p) => p.rows);
      const voucherActionMap: Record<number, string[]> = {};
      const ids = queueVouchers.map((v) => v.id);
      for (let i = 0; i < ids.length; i += ACTIONS_BATCH_SIZE) {
        const chunk = ids.slice(i, i + ACTIONS_BATCH_SIZE);
        try {
          const batch = await api.getVoucherAvailableActionsBatch(chunk);
          for (const item of batch.items) voucherActionMap[item.voucher_id] = item.actions;
        } catch (e) {
          logApiError("AllApprovalsPage.actionsBatch", e);
          const pairs = await Promise.all(
            chunk.map(async (id) => {
              try {
                const meta = await api.getVoucherAvailableActions(id);
                return [id, meta.actions] as [number, string[]];
              } catch (err) {
                logApiError("AllApprovalsPage.actions", err);
                return [id, []] as [number, string[]];
              }
            }),
          );
          for (const [id, actions] of pairs) voucherActionMap[id] = actions;
        }
      }

      const voucherRows: ApprovalRow[] = queueVouchers.map((v: VoucherResponse) => ({
        doc_type: "VOUCHER",
        id: v.id,
        number: v.voucher_number,
        date: v.voucher_date,
        status: v.status,
        amount: v.lines.filter((l) => l.entry_type === "DEBIT").reduce((sum, l) => sum + Number(l.amount || 0), 0),
        details: `${v.voucher_type}${v.reference ? ` | Ref: ${v.reference}` : ""}`,
        actions: voucherActionMap[v.id] ?? [],
      }));

      const queueRuns = runs.filter((r) => r.status === "DRAFT" || r.status === "APPROVED" || r.status === "PROCESSED");
      const runRows: ApprovalRow[] = queueRuns.map((r: PaymentRunResponse) => ({
        doc_type: "PAYMENT_RUN",
        id: r.id,
        number: r.run_code,
        date: r.run_date,
        status: r.status,
        amount: Number(r.total_amount),
        details: `${r.items.length} items${r.remarks ? ` | ${r.remarks}` : ""}`,
        actions: mapPaymentRunActions(r.status, canApproveOrProcess, canExecute),
      }));

      const reconRows: ApprovalRow[] = reconciliations
        .filter((r) => !r.is_finalized)
        .map((r: BankReconciliationResponse) => ({
          doc_type: "BANK_RECONCILIATION",
          id: r.id,
          number: `RECON-${r.id}`,
          date: r.statement_date,
          status: r.status || "OPEN",
          amount: Number(r.difference_amount),
          details: `Bank #${r.bank_account_id}${r.notes ? ` | ${r.notes}` : ""}`,
          actions: mapReconciliationActions(r, canApproveOrProcess),
        }));

      const periodRows: ApprovalRow[] = periods.map((p: AccountingPeriodResponse) => ({
        doc_type: "ACCOUNTING_PERIOD",
        id: p.id,
        number: p.period_name,
        date: p.start_date,
        status: p.is_closed ? "CLOSED" : "OPEN",
        amount: null,
        details: `${p.start_date} to ${p.end_date}`,
        actions: mapPeriodActions(p, canApproveOrProcess),
      }));

      setRows([
        ...voucherRows.map((r) => ({ ...r, href: `/app/accounts/vouchers/${r.id}` })),
        ...runRows,
        ...reconRows,
        ...periodRows,
        ...opsRows,
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canApproveOrProcess, canExecute, canApproveHr, requisitionsEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const byType = docType === "ALL" ? true : r.doc_type === docType;
      const byStatus = statusFilter === "ALL" ? true : r.status === statusFilter;
      const bySearch = q.length === 0 || r.number.toLowerCase().includes(q) || r.details.toLowerCase().includes(q);
      return byType && byStatus && bySearch;
    });
  }, [rows, search, docType, statusFilter]);

  const totalRows = rows.length;
  const actionableRows = rows.filter((r) => r.actions.length > 0).length;

  function requestAction(row: ApprovalRow, action: string) {
    if (OPS_REASON_ACTIONS.has(action)) {
      setReasonFor({ row, action });
      return;
    }
    void takeAction(row, action, "");
  }

  async function takeAction(row: ApprovalRow, action: string, reason: string) {
    const key = `${row.doc_type}-${row.id}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      setSuccess("");
      setError("");
      if (isOpsRow(row)) {
        await runOpsAction(row, action, reason);
      } else if (row.doc_type === "VOUCHER") {
        if (action === "post") {
          await api.postVoucher(row.id);
        } else {
          const mapped = ACTION_TO_STATUS[action];
          if (!mapped) throw new Error(`Unsupported action: ${action}`);
          await api.updateVoucherStatus(row.id, mapped, { reason });
        }
      } else if (row.doc_type === "PAYMENT_RUN") {
        if (action === "approve") await api.approvePaymentRun(row.id);
        else if (action === "process") await api.processPaymentRun(row.id);
        else if (action === "execute") await api.executePaymentRun(row.id);
        else throw new Error(`Unsupported action: ${action}`);
      } else if (row.doc_type === "BANK_RECONCILIATION") {
        if (action !== "finalize") throw new Error(`Unsupported action: ${action}`);
        const reason = window.prompt("Finalize reason (optional):", "") ?? "";
        await api.finalizeBankReconciliation(row.id, reason.trim() || undefined);
      } else {
        if (action === "close") await api.closeAccountingPeriod(row.id);
        else if (action === "reopen") await api.reopenAccountingPeriod(row.id);
        else throw new Error(`Unsupported action: ${action}`);
      }
      setSuccess(`${docTypeLabel(row.doc_type)} action completed: ${ACTION_LABEL[action] ?? action}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  function exportCsv() {
    const headers = ["doc_type", "id", "number", "date", "status", "amount", "details", "available_actions"];
    const lines = filteredRows.map((r) =>
      [
        r.doc_type,
        String(r.id),
        r.number.replaceAll(",", " "),
        r.date,
        r.status,
        r.amount == null ? "" : r.amount.toFixed(2),
        r.details.replaceAll(",", " "),
        r.actions.join("|"),
      ].join(","),
    );
    downloadCsv([headers.join(","), ...lines].join("\n"), "all_approvals_queue");
    setSuccess("All approvals queue exported successfully.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border-strong pb-2">
        <h1 className="text-lg font-semibold">All Approvals</h1>
      </div>
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-text-primary">All Approvals</h1>
        <p className="mt-1 text-sm text-text-muted">
          One inbox for everything waiting on you: vouchers, payment runs, reconciliations, accounting periods, purchase orders,
          requisitions, BOMs, leave requests and payroll runs.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs font-medium text-text-muted">Quick links:</span>
          <Link to="/app/accounts/vouchers/approval-queue" className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle">Voucher Approvals</Link>
          <Link to="/app/hr/leave/approvals" className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle">Leave Approvals</Link>
          <Link to="/app/hr/payroll/approvals" className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle">Payroll Approvals</Link>
          <Link to="/app/accounts/purchase-workflow" className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle">Purchase & AP</Link>
        </div>
      </div>
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      <div className="no-print grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded border bg-surface-raised p-2 text-sm">
          Total Queue Items: <b>{totalRows}</b>
        </div>
        <div className="rounded border bg-surface-raised p-2 text-sm">
          Actionable Now: <b>{actionableRows}</b>
        </div>
        <div className="rounded border bg-surface-raised p-2 text-sm">
          Shown by Filters: <b>{filteredRows.length}</b>
        </div>
      </div>

      <div className="no-print grid gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:grid-cols-2 lg:grid-cols-6">
        <input
          className="rounded border px-3 py-2 text-sm sm:col-span-2 lg:col-span-2"
          placeholder="Search number/details..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded border px-3 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value as ApprovalDocType)}>
          <option value="ALL">All Documents</option>
          <option value="VOUCHER">Voucher</option>
          <option value="PAYMENT_RUN">Payment Run</option>
          <option value="BANK_RECONCILIATION">Bank Reconciliation</option>
          <option value="ACCOUNTING_PERIOD">Accounting Period</option>
          {(Object.keys(OPS_DOC_LABEL) as OpsDocType[]).map((k) => (
            <option key={k} value={k}>
              {OPS_DOC_LABEL[k]}
            </option>
          ))}
        </select>
        <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="CHECKED">Checked</option>
          <option value="RECOMMENDED">Recommended</option>
          <option value="APPROVED">Approved</option>
          <option value="DRAFT">Draft</option>
          <option value="PROCESSED">Processed</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="PENDING">Pending</option>
          <option value="FINALIZED">Finalized</option>
        </select>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => printCurrentPage()}>
          Print
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <div className="print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-3 py-2">Doc Type</th>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-5 text-text-muted" colSpan={7}>
                  Loading approval queue...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-text-muted" colSpan={7}>
                  No approvals found for the current filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={`${r.doc_type}-${r.id}`} className="border-t">
                  <td className="px-3 py-2">{docTypeLabel(r.doc_type)}</td>
                  <td className="px-3 py-2">{r.number}</td>
                  <td className="px-3 py-2">{r.date}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-right">{r.amount == null ? "-" : r.amount.toLocaleString()}</td>
                  <td className="px-3 py-2">{r.details}</td>
                  <td className="px-3 py-2">
                    {r.actions.length === 0 && !r.href ? (
                      <span className="text-xs text-text-muted">No action</span>
                    ) : (
                      <RowActionsMenu
                        rowId={`${r.doc_type}-${r.id}`}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        label={busyKey === `${r.doc_type}-${r.id}` ? "Working…" : "Actions"}
                        items={[
                          ...(r.href ? [{ key: "open", label: "Open", href: r.href }] : []),
                          ...r.actions.map((action) => ({
                            key: action,
                            label: ACTION_LABEL[action] ?? action,
                            danger: action === "reject" || action === "cancel",
                            disabled: busyKey != null,
                            onClick: () => requestAction(r, action),
                          })),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <VoucherActionReasonModal
        open={reasonFor != null}
        title={reasonFor ? `${ACTION_LABEL[reasonFor.action] ?? reasonFor.action} ${docTypeLabel(reasonFor.row.doc_type)} ${reasonFor.row.number}` : "Confirm"}
        description="The reason is saved with the document's history."
        confirmLabel={reasonFor ? ACTION_LABEL[reasonFor.action] ?? "Confirm" : "Confirm"}
        onClose={() => setReasonFor(null)}
        onConfirm={(reason) => {
          const pending = reasonFor;
          setReasonFor(null);
          if (pending) void takeAction(pending.row, pending.action, reason);
        }}
      />
    </div>
  );
}
