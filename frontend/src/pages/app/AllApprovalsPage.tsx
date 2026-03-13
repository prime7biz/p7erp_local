import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type AccountingPeriodResponse,
  type BankReconciliationResponse,
  type PaymentRunResponse,
  type VoucherResponse,
} from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";
import { useAuth } from "@/context/AuthContext";

type ApprovalDocType = "ALL" | "VOUCHER" | "PAYMENT_RUN" | "BANK_RECONCILIATION" | "ACCOUNTING_PERIOD";

type ApprovalRow = {
  doc_type: Exclude<ApprovalDocType, "ALL">;
  id: number;
  number: string;
  date: string;
  status: string;
  amount: number | null;
  details: string;
  actions: string[];
};

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

function actionButtonClass(action: string) {
  if (action === "reject") return "rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700";
  if (action === "approve" || action === "post" || action === "execute" || action === "finalize" || action === "close") {
    return "rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700";
  }
  if (action === "check" || action === "recommend" || action === "submit" || action === "process" || action === "reopen") {
    return "rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700";
  }
  return "rounded border px-2 py-1 text-xs";
}

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
  const [myRole, setMyRole] = useState("");

  const canApproveOrProcess = myRole === "admin" || myRole === "manager";
  const canExecute = canApproveOrProcess;

  async function loadRole() {
    if (!me?.user_id) return;
    try {
      const users = await api.listUsers();
      const mine = users.find((u) => u.id === me.user_id);
      setMyRole((mine?.role_name ?? "").trim().toLowerCase());
    } catch {
      setMyRole("");
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const [vouchers, runs, reconciliations, periods] = await Promise.all([
        api.listVouchers(),
        api.listPaymentRuns(),
        api.listBankReconciliations(),
        api.listAccountingPeriods(),
      ]);
      const queueVouchers = vouchers.filter((v) => VOUCHER_QUEUE_STATUSES.includes(v.status));
      const voucherActionPairs = await Promise.all(
        queueVouchers.map(async (v) => {
          try {
            const meta = await api.getVoucherAvailableActions(v.id);
            return [v.id, meta.actions] as [number, string[]];
          } catch {
            return [v.id, []] as [number, string[]];
          }
        }),
      );
      const voucherActionMap: Record<number, string[]> = {};
      for (const [id, actions] of voucherActionPairs) voucherActionMap[id] = actions;

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

      setRows([...voucherRows, ...runRows, ...reconRows, ...periodRows]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRole();
  }, [me?.user_id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRole]);

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

  async function takeAction(row: ApprovalRow, action: string) {
    try {
      setSuccess("");
      if (row.doc_type === "VOUCHER") {
        if (action === "post") {
          await api.postVoucher(row.id);
        } else {
          const mapped = ACTION_TO_STATUS[action];
          if (!mapped) throw new Error(`Unsupported action: ${action}`);
          await api.updateVoucherStatus(row.id, mapped);
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
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">All Approvals</h1>
      </div>
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-slate-900">All Approvals</h1>
        <p className="mt-1 text-sm text-slate-500">Generic cross-document approval hub for vouchers, payment runs, reconciliation, and accounting periods.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs font-medium text-slate-500">Quick links:</span>
          <Link to="/app/accounts/vouchers/approval-queue" className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Voucher Approvals</Link>
          <Link to="/app/hr/leave/approvals" className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Leave Approvals</Link>
          <Link to="/app/hr/payroll/approvals" className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Payroll Approvals</Link>
          <Link to="/app/accounts/purchase-workflow" className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Purchase & AP</Link>
        </div>
      </div>
      {error ? <div className="no-print rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="no-print grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded border bg-white p-2 text-sm">
          Total Queue Items: <b>{totalRows}</b>
        </div>
        <div className="rounded border bg-white p-2 text-sm">
          Actionable Now: <b>{actionableRows}</b>
        </div>
        <div className="rounded border bg-white p-2 text-sm">
          Shown by Filters: <b>{filteredRows.length}</b>
        </div>
      </div>

      <div className="no-print grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
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
        </select>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => printCurrentPage()}>
          Print
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <div className="print-card overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
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
                <td className="px-3 py-5 text-slate-500" colSpan={7}>
                  Loading approval queue...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={7}>
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
                    <div className="flex flex-wrap gap-1">
                      {r.actions.length === 0 ? <span className="text-xs text-slate-500">No action</span> : null}
                      {r.actions.map((action) => (
                        <button key={action} className={actionButtonClass(action)} onClick={() => void takeAction(r, action)}>
                          {ACTION_LABEL[action] ?? action}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
