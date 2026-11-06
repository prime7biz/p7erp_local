import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type VoucherResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { useListPagination } from "@/hooks/useListPagination";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { VoucherWorkflowProgress } from "@/components/vouchers/VoucherWorkflowProgress";
import {
  ACTION_LABEL,
  ACTION_TO_STATUS,
  ACTIONS_NEEDING_REASON,
  VOUCHER_PENDING_APPROVAL_STATUSES,
  VOUCHER_STATUSES,
} from "@/components/vouchers/workflowMeta";
import { logApiError } from "@/utils/logApiError";
import { toLocalISODate, todayLocalISO } from "@/lib/dates";
import { sumMoneyBy } from "@/lib/money";
import { useLatestRequest } from "@/hooks/useLatestRequest";

const CTL =
  "rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";
const BTN =
  "rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle";

const EXPORT_BATCH = 1000;

const CHIP_KEYS = ["ALL", "PENDING", "DRAFT", "REJECTED", "POSTED", "CLOSED"] as const;
type ChipKey = (typeof CHIP_KEYS)[number];

/** Grouped views shown as chips; a single status code is also a valid filter. */
const GROUPS: Record<ChipKey, { label: string; statuses: readonly string[] | null }> = {
  ALL: { label: "All", statuses: null },
  PENDING: { label: "Waiting for approval", statuses: VOUCHER_PENDING_APPROVAL_STATUSES },
  DRAFT: { label: "Draft", statuses: ["DRAFT"] },
  REJECTED: { label: "Rejected", statuses: ["REJECTED"] },
  POSTED: { label: "Posted", statuses: ["POSTED"] },
  CLOSED: { label: "Cancelled / Reversed", statuses: ["CANCELLED", "REVERSED"] },
};

function isChipKey(value: string): value is ChipKey {
  return (CHIP_KEYS as readonly string[]).includes(value);
}

function statusesForFilter(filter: string): readonly string[] | null {
  return isChipKey(filter) ? GROUPS[filter].statuses : [filter];
}

function statusParams(filter: string): { status_filter?: string; status_filters?: readonly string[] } {
  const statuses = statusesForFilter(filter);
  if (!statuses) return {};
  if (statuses.length === 1) return { status_filter: statuses[0] };
  return { status_filters: statuses };
}

function defaultFromDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return toLocalISODate(d);
}

function debitTotal(r: VoucherResponse) {
  return sumMoneyBy(r.lines.filter((l) => l.entry_type === "DEBIT"), (l) => l.amount);
}

export function VoucherApprovalsPage() {
  const navigate = useNavigate();
  const { page, setPage, pageSize, setPageSize, offset, limit, allowedSizes } = useListPagination();
  const [rows, setRows] = useState<VoucherResponse[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [availableActionMap, setAvailableActionMap] = useState<Record<number, string[]>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(() => todayLocalISO());
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

  const latest = useLatestRequest();
  const loadList = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    setError("");
    setOpenActionsId(null);
    loadedActionsRef.current.clear();
    setAvailableActionMap({});
    try {
      const [list, summary] = await Promise.all([
        api.listVouchersWithTotal({
          ...statusParams(statusFilter),
          search: debouncedSearch || undefined,
          from_date: fromDate,
          to_date: toDate,
          limit,
          offset,
          sort: "date",
        }),
        api.getVoucherReportSummary({ from_date: fromDate, to_date: toDate }),
      ]);
      if (!latest.isCurrent(token)) return;
      setRows(list.rows);
      setTotalRows(list.total ?? list.rows.length);
      setStatusCounts(summary.status_counts ?? {});
    } catch (e) {
      logApiError("VoucherApprovalsPage.loadList", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, debouncedSearch, fromDate, statusFilter, toDate, limit, offset]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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
      setSuccess("");
      try {
        if (action === "post") {
          const v = await api.postVoucher(voucherId);
          if (v.control_warnings?.length) {
            setSuccess(`Posted. Review: ${v.control_warnings.join(" ")}`);
            await loadList();
            return;
          }
        } else if (action === "reverse") {
          await api.reverseVoucher(voucherId, { reason: reason.trim() || "Reversal" });
        }
        else if (action === "cancel_posting") await api.cancelVoucherPosting(voucherId);
        else {
          const mappedStatus = ACTION_TO_STATUS[action];
          if (!mappedStatus) throw new Error(`Unsupported action: ${action}`);
          await api.updateVoucherStatus(voucherId, mappedStatus, { reason });
        }
        const label = ACTION_LABEL[action] ?? action;
        setSuccess(reason.trim() ? `Completed: ${label} — ${reason.trim()}` : `Completed: ${label}`);
        await loadList();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [loadList],
  );

  function takeAction(voucherId: number, action: string) {
    if (ACTIONS_NEEDING_REASON.has(action)) {
      setPendingWorkflowAction({ voucherId, action });
      return;
    }
    void runWorkflowAction(voucherId, action, "");
  }

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const all: VoucherResponse[] = [];
      for (let start = 0; ; start += EXPORT_BATCH) {
        const res = await api.listVouchersWithTotal({
          ...statusParams(statusFilter),
          search: debouncedSearch || undefined,
          from_date: fromDate,
          to_date: toDate,
          limit: EXPORT_BATCH,
          offset: start,
          sort: "date",
        });
        all.push(...res.rows);
        if (res.rows.length < EXPORT_BATCH) break;
      }
      const headers = ["voucher_id", "voucher_number", "voucher_date", "voucher_type", "status", "reference", "amount"];
      const lines = all.map((r) =>
        [r.id, r.voucher_number, r.voucher_date, r.voucher_type, r.status, (r.reference ?? "").replaceAll(",", " "), debitTotal(r).toFixed(2)].join(","),
      );
      downloadCsv([headers.join(","), ...lines].join("\n"), "voucher_approval_queue");
      setSuccess(`Exported ${all.length} voucher${all.length === 1 ? "" : "s"} to CSV.`);
    } catch (e) {
      logApiError("VoucherApprovalsPage.exportCsv", e);
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function chipCount(key: ChipKey): number {
    const statuses = GROUPS[key].statuses;
    if (!statuses) return Object.values(statusCounts).reduce((s, n) => s + n, 0);
    return statuses.reduce((s, st) => s + (statusCounts[st] ?? 0), 0);
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border-strong pb-2">
        <h1 className="text-lg font-semibold">Voucher Approval Queue</h1>
        <p className="text-xs text-text-muted">
          {fromDate} to {toDate}
        </p>
      </div>
      <div className="no-print">
        <AppPageHeader
          title="Voucher Approval Queue"
          description="Every voucher in the date range with its approval stage. Use Waiting for approval for the reviewer's work list. Dates default to the last 3 months."
          backTo={{ label: "Vouchers", to: "/app/accounts/vouchers" }}
        />
      </div>
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      <div className="no-print flex flex-wrap gap-2" role="group" aria-label="Filter by approval stage">
        {CHIP_KEYS.map((key) => {
          const active = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-brand-primary bg-brand-primary text-brand-primary-foreground"
                  : "border-border-strong bg-surface-raised text-text-secondary hover:bg-surface-subtle"
              }`}
            >
              {GROUPS[key].label} <span className={active ? "opacity-90" : "text-text-muted"}>({chipCount(key)})</span>
            </button>
          );
        })}
      </div>

      <div className="no-print grid gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className={CTL}
          placeholder="Search voucher number/reference/description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={CTL} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
          <option value="ALL">All statuses</option>
          <option value="PENDING">Waiting for approval</option>
          {VOUCHER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
          <option value="CLOSED">Cancelled / Reversed</option>
        </select>
        <input type="date" className={CTL} value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" />
        <input type="date" className={CTL} value={toDate} onChange={(e) => setToDate(e.target.value)} title="To date" />
        <button type="button" className={BTN} onClick={() => printCurrentPage()}>
          Print Current Page
        </button>
        <button type="button" className={BTN} disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
        <button type="button" className={BTN} onClick={() => void loadList()}>
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
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status &amp; progress</th>
              <th className="no-print px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-5 text-text-muted" colSpan={7}>
                  Loading vouchers...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-text-muted" colSpan={7}>
                  No vouchers between {fromDate} and {toDate}. Widen the date range or pick another status.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
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
                  <td className="max-w-[10rem] truncate px-3 py-2" title={r.reference ?? undefined}>
                    {r.reference ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{debitTotal(r).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <VoucherWorkflowProgress status={r.status} />
                  </td>
                  <td className="no-print px-3 py-2">
                    <RowActionsMenu
                      menuPortal
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={(id) => setOpenActionsId(id == null ? null : Number(id))}
                      items={[
                        { key: "view", label: "View details", onClick: () => navigate(`/app/accounts/vouchers/${r.id}`) },
                        {
                          key: "print",
                          label: "Print / PDF",
                          onClick: () => navigate(`/app/accounts/vouchers/print?voucher_id=${r.id}`),
                        },
                        ...(availableActionMap[r.id] ?? []).map((action) => ({
                          key: `wf-${action}`,
                          label: ACTION_LABEL[action] ?? action,
                          onClick: () => takeAction(r.id, action),
                        })),
                      ]}
                    />
                  </td>
                </tr>
              ))
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
        description="A short reason helps your team during review. It is saved in the voucher's History."
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
