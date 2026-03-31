import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type VoucherResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { useListPagination } from "@/hooks/useListPagination";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { logApiError } from "@/utils/logApiError";

const QUEUE_STATUSES = ["SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED"] as const;

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
  reverse: "Reverse",
  cancel_posting: "Cancel posting",
};

const ACTIONS_NEEDING_REASON = new Set(["reject", "cancel", "reverse", "cancel_posting"]);

function defaultFromDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

export function VoucherApprovalsPage() {
  const navigate = useNavigate();
  const { page, setPage, pageSize, setPageSize, offset, limit, allowedSizes } = useListPagination();
  const [mergedRows, setMergedRows] = useState<VoucherResponse[]>([]);
  const [availableActionMap, setAvailableActionMap] = useState<Record<number, string[]>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [pendingWorkflowAction, setPendingWorkflowAction] = useState<{ voucherId: number; action: string } | null>(null);
  const loadedActionsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, fromDate, toDate, setPage]);

  const loadMerged = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setOpenActionsId(null);
    loadedActionsRef.current.clear();
    setAvailableActionMap({});
    try {
      const statuses =
        statusFilter === "ALL" ? [...QUEUE_STATUSES] : statusFilter && QUEUE_STATUSES.includes(statusFilter as (typeof QUEUE_STATUSES)[number]) ? [statusFilter] : [...QUEUE_STATUSES];

      const results = await Promise.all(
        statuses.map((s) =>
          api.listVouchersWithTotal({
            status_filter: s,
            search: debouncedSearch || undefined,
            from_date: fromDate,
            to_date: toDate,
            limit: 500,
            offset: 0,
          }),
        ),
      );

      const map = new Map<number, VoucherResponse>();
      for (const r of results) {
        for (const row of r.rows) {
          map.set(row.id, row);
        }
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const da = a.voucher_date.localeCompare(b.voucher_date);
        if (da !== 0) return -da;
        return b.id - a.id;
      });
      setMergedRows(merged);
    } catch (e) {
      setError((e as Error).message);
      logApiError("VoucherApprovalsPage.loadMerged", e);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, fromDate, statusFilter, toDate]);

  useEffect(() => {
    void loadMerged();
  }, [loadMerged]);

  const totalRows = mergedRows.length;
  const pageRows = useMemo(() => mergedRows.slice(offset, offset + limit), [mergedRows, offset, limit]);

  useEffect(() => {
    if (openActionsId == null) return;
    const vid = openActionsId;
    if (loadedActionsRef.current.has(vid)) return;
    loadedActionsRef.current.add(vid);
    void api
      .getVoucherAvailableActions(vid)
      .then((m) => setAvailableActionMap((p) => ({ ...p, [vid]: m.actions })))
      .catch((e) => {
        logApiError("VoucherApprovalsPage.getVoucherAvailableActions", e);
        setAvailableActionMap((p) => ({ ...p, [vid]: [] }));
      });
  }, [openActionsId]);

  const runWorkflowAction = useCallback(
    async (voucherId: number, action: string, reason: string) => {
      try {
        if (action === "post") {
          const v = await api.postVoucher(voucherId);
          if (v.control_warnings?.length) {
            setSuccess(`Posted. Review: ${v.control_warnings.join(" ")}`);
            await loadMerged();
            return;
          }
        } else if (action === "reverse") {
          await api.reverseVoucher(voucherId, { reason: reason.trim() || "Reversal" });
        }
        else if (action === "cancel_posting") await api.cancelVoucherPosting(voucherId);
        else {
          const mappedStatus = ACTION_TO_STATUS[action];
          if (!mappedStatus) throw new Error(`Unsupported action: ${action}`);
          await api.updateVoucherStatus(voucherId, mappedStatus);
        }
        const label = ACTION_LABEL[action] ?? action;
        setSuccess(reason.trim() ? `Completed: ${label} — ${reason.trim()}` : `Completed: ${label}`);
        await loadMerged();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [loadMerged],
  );

  function takeAction(voucherId: number, action: string) {
    if (ACTIONS_NEEDING_REASON.has(action)) {
      setPendingWorkflowAction({ voucherId, action });
      return;
    }
    void runWorkflowAction(voucherId, action, "");
  }

  function exportCsv() {
    const headers = ["voucher_id", "voucher_number", "voucher_date", "voucher_type", "status", "reference", "amount"];
    const lines = mergedRows.map((r) => {
      const amount = r.lines.filter((l) => l.entry_type === "DEBIT").reduce((sum, l) => sum + Number(l.amount || 0), 0);
      return [r.id, r.voucher_number, r.voucher_date, r.voucher_type, r.status, r.reference ?? "", amount.toFixed(2)].join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "voucher_approval_queue");
    setSuccess("Approval queue exported to CSV.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border-strong pb-2">
        <h1 className="text-lg font-semibold">Voucher Approval Queue</h1>
      </div>
      <div className="no-print">
        <AppPageHeader
          title="Voucher Approval Queue"
          description="Review vouchers in the approval pipeline. Dates default to the last 3 months — adjust filters as needed."
          backTo={{ label: "Vouchers", to: "/app/accounts/vouchers" }}
        />
      </div>
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}
      <div className="no-print grid gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Search voucher number/reference/description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded border border-border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All Queue Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="CHECKED">Checked</option>
          <option value="RECOMMENDED">Recommended</option>
          <option value="APPROVED">Approved</option>
        </select>
        <input type="date" className="rounded border border-border px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" />
        <input type="date" className="rounded border border-border px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} title="To date" />
        <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => printCurrentPage()}>
          Print Queue
        </button>
        <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => exportCsv()}>
          Export CSV
        </button>
        <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => void loadMerged()}>
          Refresh
        </button>
      </div>
      <div className="print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-3 py-2">Voucher No</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-5 text-text-muted" colSpan={6}>
                  Loading approval queue...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-text-muted" colSpan={6}>
                  No pending vouchers in approval queue for this filter.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const amount = r.lines.filter((l) => l.entry_type === "DEBIT").reduce((sum, l) => sum + Number(l.amount || 0), 0);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-medium text-brand-primary hover:underline"
                        onClick={() => navigate(`/app/accounts/vouchers/${r.id}`)}
                      >
                        {r.voucher_number}
                      </button>
                    </td>
                    <td className="px-3 py-2">{r.voucher_date}</td>
                    <td className="px-3 py-2">{r.voucher_type}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{amount.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <button
                          type="button"
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                          onClick={() => setOpenActionsId((prev) => (prev === r.id ? null : r.id))}
                        >
                          Actions
                        </button>
                        {openActionsId === r.id ? (
                          <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              onClick={() => navigate(`/app/accounts/vouchers/${r.id}`)}
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              onClick={() => navigate(`/app/accounts/vouchers/print?voucher_id=${r.id}`)}
                            >
                              Print / PDF
                            </button>
                            {(availableActionMap[r.id] ?? []).map((action) => (
                              <button
                                key={action}
                                type="button"
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                onClick={() => {
                                  setOpenActionsId(null);
                                  takeAction(r.id, action);
                                }}
                              >
                                {ACTION_LABEL[action] ?? action}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && totalRows > 0 ? (
        <div className="no-print">
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={totalRows}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            allowedSizes={allowedSizes}
          />
        </div>
      ) : null}

      <VoucherActionReasonModal
        open={pendingWorkflowAction != null}
        title={
          pendingWorkflowAction
            ? `Confirm ${ACTION_LABEL[pendingWorkflowAction.action] ?? pendingWorkflowAction.action}`
            : "Confirm"
        }
        description="A short reason helps your team during review. Full audit storage in the database is planned (see docs/voucher_backend_gaps.md)."
        confirmLabel={pendingWorkflowAction ? ACTION_LABEL[pendingWorkflowAction.action] ?? "Confirm" : "Confirm"}
        onClose={() => setPendingWorkflowAction(null)}
        onConfirm={(reason) => {
          if (!pendingWorkflowAction) return;
          const { voucherId, action } = pendingWorkflowAction;
          setPendingWorkflowAction(null);
          void runWorkflowAction(voucherId, action, reason);
        }}
      />
    </div>
  );
}
