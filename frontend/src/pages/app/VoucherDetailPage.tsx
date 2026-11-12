import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecordBreadcrumb } from "@/components/shell/recordBreadcrumb";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  api,
  type VoucherPrintResponse,
  type VoucherResponse,
  type ChartOfAccountResponse,
  type CostCenterResponse,
  type BillReferenceRow,
  type VoucherPostPreflightResponse,
} from "@/api/client";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { VoucherPrintSheets } from "@/components/print/VoucherPrintSheets";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LinkedRecordsSection, type LinkedRecordRow } from "@/components/app/LinkedRecordsSection";
import { VoucherHistoryPanel } from "@/components/vouchers/VoucherHistoryPanel";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { useAuth } from "@/context/AuthContext";
import { resolveRole } from "@/lib/roles";
import { logApiError } from "@/utils/logApiError";
import { findPartyLedgerByAccount } from "@/lib/remoteSelectFetchers";
import { voucherPrintVerificationUrl } from "@/utils/verifyPrintUrl";
import { moneyEquals, sumMoneyBy } from "@/lib/money";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { getChartOfAccountsCached, getCostCentersCached } from "@/lib/masterData";
import { useConfirm } from "@/components/app/useConfirm";

const WORKFLOW_STEPS = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED"];
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SUBMITTED: "bg-blue-50 text-blue-700",
    CHECKED: "bg-indigo-50 text-indigo-700",
    RECOMMENDED: "bg-violet-50 text-violet-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    POSTED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-50 text-red-700",
    CANCELLED: "bg-orange-50 text-orange-700",
    REVERSED: "bg-yellow-50 text-yellow-700",
  };
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

export function VoucherDetailPage() {
  const confirm = useConfirm();
  const { voucherId } = useParams<{ voucherId: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const directPostOn = me?.feature_flags?.direct_post_vouchers === true && resolveRole(me?.role_name).isElevated;
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
  useRecordBreadcrumb(voucher?.voucher_number);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterResponse[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [billRefs, setBillRefs] = useState<BillReferenceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [tradeCaseLabel, setTradeCaseLabel] = useState<string | null>(null);
  const [btbLcLabel, setBtbLcLabel] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<VoucherPrintResponse | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printCopyCount, setPrintCopyCount] = useState(1);
  const [printTemplate, setPrintTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const [budgetPreflight, setBudgetPreflight] = useState<VoucherPostPreflightResponse | null>(null);
  const [budgetOverrideOpen, setBudgetOverrideOpen] = useState(false);
  const [budgetOverrideReason, setBudgetOverrideReason] = useState("");
  const [posting, setPosting] = useState(false);

  const latest = useLatestRequest();
  const loadVoucher = useCallback(async () => {
    const id = Number(voucherId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid voucher ID.");
      setLoading(false);
      return;
    }
    const token = latest.begin();
    setLoading(true);
    try {
      const [v, a, c] = await Promise.all([
        api.getVoucher(id),
        getChartOfAccountsCached({ active_only: false }),
        getCostCentersCached({ active_only: false }),
      ]);
      if (!latest.isCurrent(token)) return;
      setVoucher(v);
      setAccounts(a);
      setCostCenters(c);
      try {
        const meta = await api.getVoucherAvailableActions(id);
        if (!latest.isCurrent(token)) return;
        setActions(meta.actions);
      } catch (e) {
        logApiError("VoucherDetailPage.getVoucherAvailableActions", e);
        if (!latest.isCurrent(token)) return;
        setActions([]);
      }
      try {
        const refs = await api.listBillReferences();
        if (!latest.isCurrent(token)) return;
        setBillRefs(refs.filter((r) => r.source_voucher_id === id));
      } catch (e) {
        logApiError("VoucherDetailPage.listBillReferences", e);
        if (!latest.isCurrent(token)) return;
        setBillRefs([]);
      }
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, voucherId]);

  useEffect(() => {
    void loadVoucher();
  }, [loadVoucher]);

  useEffect(() => {
    if (!voucher?.trade_case_id) {
      setTradeCaseLabel(null);
      return;
    }
    let cancelled = false;
    void api
      .getTradeCase(voucher.trade_case_id)
      .then((t) => {
        if (!cancelled) setTradeCaseLabel(t.reference);
      })
      .catch((e) => {
        logApiError("VoucherDetailPage.getTradeCase", e);
        if (!cancelled) setTradeCaseLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [voucher?.trade_case_id]);

  useEffect(() => {
    if (!voucher?.btb_lc_id) {
      setBtbLcLabel(null);
      return;
    }
    let cancelled = false;
    void api
      .getBtbLc(voucher.btb_lc_id)
      .then((b) => {
        if (!cancelled) setBtbLcLabel((b.lc_number || b.reference || `#${b.id}`) as string);
      })
      .catch((e) => {
        logApiError("VoucherDetailPage.getBtbLc", e);
        if (!cancelled) setBtbLcLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [voucher?.btb_lc_id]);

  const billWiseAccountIds = useMemo(
    () => new Set(accounts.filter((a) => a.enable_bill_wise).map((a) => a.id)),
    [accounts],
  );

  function accountName(accountId: number) {
    const a = accounts.find((x) => x.id === accountId);
    return a ? `${a.account_number} — ${a.name}` : `Account #${accountId}`;
  }

  function costCenterName(ccId: number | null | undefined) {
    if (!ccId) return "—";
    const c = costCenters.find((x) => x.id === ccId);
    return c ? `${c.center_code} — ${c.name}` : `CC #${ccId}`;
  }

  function lineCostNatureLabel(line: { account_id: number; cost_nature_override?: string | null }) {
    if (line.cost_nature_override) return line.cost_nature_override;
    const a = accounts.find((x) => x.id === line.account_id);
    const d = a?.cost_nature;
    return d ? `${d} (account)` : "—";
  }

  const runAction = useCallback(
    async (action: string, reason: string, opts?: { budget_override?: boolean }) => {
      if (!voucher) return;
      setError(null);
      setSuccess(null);
      try {
        if (action === "post") {
          setPosting(true);
          const posted = await api.postVoucher(voucher.id, {
            budget_override: opts?.budget_override,
            budget_override_reason: opts?.budget_override ? reason : undefined,
          });
          if (posted.control_warnings?.length) {
            setSuccess(`Posted. Review: ${posted.control_warnings.join(" ")}`);
            await loadVoucher();
            return;
          }
        } else if (action === "reverse") {
          await api.reverseVoucher(voucher.id, { reason: reason.trim() || "Reversal" });
        }
        else if (action === "cancel_posting") await api.cancelVoucherPosting(voucher.id);
        else {
          const nextStatus = ACTION_TO_STATUS[action];
          if (!nextStatus) throw new Error(`Unsupported action: ${action}`);
          await api.updateVoucherStatus(voucher.id, nextStatus, { reason });
        }
        const label = ACTION_LABEL[action] ?? action;
        setSuccess(reason.trim() ? `Action complete: ${label} — ${reason.trim()}` : `Action complete: ${label}`);
        await loadVoucher();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPosting(false);
        setBudgetOverrideOpen(false);
        setBudgetOverrideReason("");
      }
    },
    [voucher, loadVoucher],
  );

  async function requestAction(action: string) {
    if (ACTIONS_NEEDING_REASON.has(action)) {
      setPendingAction(action);
      return;
    }
    if (action === "post" && voucher) {
      setError(null);
      setSuccess(null);
      try {
        setPosting(true);
        const pre = await api.voucherPostPreflight(voucher.id);
        setBudgetPreflight(pre);
        if (pre.warnings?.length || pre.status === "near_limit" || pre.status === "exceeded") {
          // Surface banner immediately; still allow warn-mode post below.
        }
        if (pre.can_post === false || (pre.mode === "block" && pre.status === "exceeded")) {
          setBudgetOverrideOpen(true);
          return;
        }
        if (pre.warnings?.length && (pre.mode === "warn" || pre.status === "near_limit" || pre.status === "exceeded")) {
          const ok = await confirm({
            title: "Post this voucher anyway?",
            description: pre.warning_message || pre.warnings.join("\n"),
            confirmLabel: "Post anyway",
          });
          if (!ok) return;
        }
        await runAction("post", "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPosting(false);
      }
      return;
    }
    void runAction(action, "");
  }

  async function handleDelete() {
    if (!voucher) return;
    if (!(await confirm({ title: "Delete this voucher permanently?", danger: true }))) return;
    try {
      await api.deleteVoucher(voucher.id);
      navigate("/app/accounts/vouchers");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const debitTotal = useMemo(() => {
    if (!voucher) return 0;
    return sumMoneyBy(voucher.lines.filter((l) => l.entry_type === "DEBIT"), (l) => l.amount);
  }, [voucher]);

  const creditTotal = useMemo(() => {
    if (!voucher) return 0;
    return sumMoneyBy(voucher.lines.filter((l) => l.entry_type === "CREDIT"), (l) => l.amount);
  }, [voucher]);

  const stepIndex = voucher ? WORKFLOW_STEPS.indexOf(voucher.status) : -1;

  const hasBillWiseLines = useMemo(
    () => (voucher ? voucher.lines.some((l) => billWiseAccountIds.has(l.account_id)) : false),
    [voucher, billWiseAccountIds],
  );

  const workflowStripItems = useMemo(() => {
    if (!voucher) return [];
    return [
      { label: "Status", value: voucher.status },
      { label: "Type", value: voucher.voucher_type },
      { label: "Date", value: voucher.voucher_date },
      {
        label: "Amount",
        value: debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        hint: `${voucher.currency}${voucher.currency !== voucher.base_currency ? ` @ ${voucher.exchange_rate}` : ""}`,
      },
    ];
  }, [voucher, debitTotal]);

  const linkedColumns = useMemo(() => {
    if (!voucher) return [];
    const cols: { title: string; rows: LinkedRecordRow[] }[] = [];
    if (voucher.trade_case_id) {
      cols.push({
        title: "Trade",
        rows: [
          {
            id: voucher.trade_case_id,
            label: tradeCaseLabel ?? `Case #${voucher.trade_case_id}`,
            sub: "Trade case",
            to: `/app/trade/cases/${voucher.trade_case_id}`,
          },
        ],
      });
    }
    if (voucher.btb_lc_id) {
      cols.push({
        title: "Commercial",
        rows: [
          {
            id: voucher.btb_lc_id,
            label: btbLcLabel ?? `BTB LC #${voucher.btb_lc_id}`,
            sub: "Back-to-back LC",
            to: `/app/commercial/btb-lcs`,
          },
        ],
      });
    }
    if (billRefs.length > 0) {
      cols.push({
        title: "Bill references",
        rows: billRefs.map((r) => ({
          id: r.id,
          label: r.bill_number,
          sub: `${r.bill_type} · ${r.party_name}`,
          to: "/app/accounts/outstanding-bills",
        })),
      });
    }
    return cols;
  }, [voucher, billRefs, tradeCaseLabel, btbLcLabel]);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-muted">Loading voucher...</div>;
  if (!voucher) return <div className="py-16 text-center text-sm text-text-muted">{error ?? "Voucher not found."}</div>;

  return (
    <div className="space-y-6">
      <AppPageHeader
        title={voucher.voucher_number}
        description={`${voucher.voucher_type} voucher · ${voucher.voucher_date}`}
        backTo={{ label: "Back to vouchers", to: "/app/accounts/vouchers" }}
        actions={<StatusBadge status={voucher.status} />}
        belowTitle={<WorkflowSummaryStrip items={workflowStripItems} />}
      />

      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}
      {budgetPreflight &&
      (budgetPreflight.status === "near_limit" ||
        budgetPreflight.status === "exceeded" ||
        (budgetPreflight.warnings?.length ?? 0) > 0) ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            budgetPreflight.status === "exceeded"
              ? "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground"
              : "border-status-warning/30 bg-status-warning-subtle text-status-warning-foreground"
          }`}
        >
          <div className="font-semibold">
            Budget {budgetPreflight.status === "exceeded" ? "exceeded" : "near limit"}
            {budgetPreflight.enforcement_mode || budgetPreflight.mode
              ? ` · Enforcement: ${budgetPreflight.enforcement_mode || budgetPreflight.mode}`
              : ""}
          </div>
          <p className="mt-1 text-xs">
            {budgetPreflight.warning_message || budgetPreflight.warnings?.join(" ") || "Review budget utilization before posting."}
          </p>
          {budgetPreflight.remaining != null ? (
            <p className="mt-1 text-xs tabular-nums">Remaining after this voucher: {budgetPreflight.remaining}</p>
          ) : null}
        </div>
      ) : null}

      <LinkedRecordsSection title="Linked records" columns={linkedColumns} />

      {/* Approval Stepper */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-secondary">Approval Progress</h3>
        <div className="flex items-center gap-1">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isDone = stepIndex >= idx;
            const isCurrent = stepIndex === idx;
            return (
              <div key={step} className="flex flex-1 items-center">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent
                      ? "bg-brand-primary text-brand-primary-foreground ring-2 ring-brand-primary/30"
                      : isDone
                        ? "bg-status-success-subtle text-status-success-foreground"
                        : "bg-surface-subtle text-text-muted"
                  }`}
                >
                  {isDone && !isCurrent ? "✓" : idx + 1}
                </div>
                <div className="ml-2 hidden text-xs sm:block">
                  <p
                    className={`font-medium ${
                      isCurrent ? "text-brand-primary" : isDone ? "text-status-success-foreground" : "text-text-muted"
                    }`}
                  >
                    {step}
                  </p>
                </div>
                {idx < WORKFLOW_STEPS.length - 1 ? (
                  <div className={`mx-2 h-px flex-1 ${isDone ? "bg-status-success-foreground/30" : "bg-border"}`} />
                ) : null}
              </div>
            );
          })}
        </div>
        {voucher.status === "REJECTED" || voucher.status === "CANCELLED" || voucher.status === "REVERSED" ? (
          <p className="mt-2 text-xs text-status-danger-foreground">This voucher is {voucher.status.toLowerCase()}.</p>
        ) : null}
      </div>

      {/* Voucher Information */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-secondary">Voucher Information</h3>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <span className="text-text-muted">Voucher Number</span>
            <div className="font-semibold text-text-primary">{voucher.voucher_number}</div>
          </div>
          <div>
            <span className="text-text-muted">Type</span>
            <div className="font-semibold text-text-primary">{voucher.voucher_type}</div>
          </div>
          <div>
            <span className="text-text-muted">Date</span>
            <div className="font-semibold text-text-primary">{voucher.voucher_date}</div>
          </div>
          <div>
            <span className="text-text-muted">Reference</span>
            <div className="font-semibold text-text-primary">{voucher.reference ?? "—"}</div>
          </div>
          <div>
            <span className="text-text-muted">Currency</span>
            <div className="font-semibold text-text-primary">
              {voucher.currency}
              {voucher.currency !== voucher.base_currency ? ` (Base: ${voucher.base_currency}, Rate: ${voucher.exchange_rate})` : ""}
            </div>
          </div>
          <div>
            <span className="text-text-muted">FX Rate Source</span>
            <div className="font-semibold text-text-primary">{voucher.exchange_rate_source || "—"}</div>
          </div>
          <div className="md:col-span-3">
            <span className="text-text-muted">Narration</span>
            <div className="font-semibold text-text-primary">{voucher.description ?? "—"}</div>
          </div>
          {voucher.trade_case_id ? (
            <div>
              <span className="text-text-muted">Trade case</span>
              <div className="font-semibold text-text-primary">{tradeCaseLabel ?? `#${voucher.trade_case_id}`}</div>
            </div>
          ) : null}
          {voucher.btb_lc_id ? (
            <div>
              <span className="text-text-muted">BTB LC</span>
              <div className="font-semibold text-text-primary">{btbLcLabel ?? `#${voucher.btb_lc_id}`}</div>
            </div>
          ) : null}
          {voucher.verification_id ? (
            <div className="md:col-span-3">
              <span className="text-text-muted">Verification ID</span>
              <div className="font-mono text-xs text-text-primary">{voucher.verification_id}</div>
              <div className="mt-1 text-xs text-text-muted">
                {voucher.signed_by_system ? "Digitally signed" : "Not signed"}
                {voucher.signed_at ? ` at ${voucher.signed_at}` : ""}
              </div>
            </div>
          ) : null}
          <div>
            <span className="text-text-muted">Branch</span>
            <div className="font-semibold text-text-primary">{voucher.branch_code ?? "MAIN"}</div>
          </div>
          {voucher.fiscal_year != null ? (
            <div>
              <span className="text-text-muted">Fiscal year</span>
              <div className="font-semibold text-text-primary">{voucher.fiscal_year}</div>
            </div>
          ) : null}
          {voucher.instrument_reference ? (
            <div>
              <span className="text-text-muted">Instrument / bank ref.</span>
              <div className="font-semibold text-text-primary">{voucher.instrument_reference}</div>
            </div>
          ) : null}
          {voucher.source_module && voucher.source_module !== "MANUAL" ? (
            <div className="md:col-span-3 rounded-lg border border-dashed border-border bg-surface-subtle/50 px-3 py-2 text-xs">
              <span className="font-semibold text-text-secondary">Source module: </span>
              <span className="text-text-primary">{voucher.source_module}</span>
              {voucher.source_module_ref ? <span className="text-text-muted"> ({voucher.source_module_ref})</span> : null}
              {voucher.allow_manual_edit === false ? (
                <span className="block pt-1 text-text-muted">Manual edits are not allowed for this voucher.</span>
              ) : null}
            </div>
          ) : null}
          {voucher.reverses_voucher_id ? (
            <div className="md:col-span-3 text-sm">
              <span className="text-text-muted">Reverses voucher </span>
              <Link className="font-medium text-brand-primary hover:underline" to={`/app/accounts/vouchers/${voucher.reverses_voucher_id}`}>
                #{voucher.reverses_voucher_id}
              </Link>
              {voucher.reversal_reason ? <p className="mt-1 text-xs text-text-muted">Reason: {voucher.reversal_reason}</p> : null}
              {voucher.reversal_recorded_at ? (
                <p className="text-xs text-text-muted">Recorded at {voucher.reversal_recorded_at}</p>
              ) : null}
            </div>
          ) : null}
          {voucher.reversed_by_voucher_id ? (
            <div className="md:col-span-3 text-sm">
              <span className="text-text-muted">Reversed by </span>
              <Link className="font-medium text-brand-primary hover:underline" to={`/app/accounts/vouchers/${voucher.reversed_by_voucher_id}`}>
                #{voucher.reversed_by_voucher_id}
              </Link>
            </div>
          ) : null}
        </div>
        {voucher.status === "POSTED" && voucher.posted_snapshot && typeof voucher.posted_snapshot === "object" ? (
          <div className="mt-4 rounded-lg border border-border bg-surface-subtle/30 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">Posted snapshot (immutable)</h4>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-text-muted">
              {JSON.stringify(voucher.posted_snapshot, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-secondary">Line Items</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="w-10 px-3 py-2 text-center">#</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Cost Center</th>
                <th className="px-3 py-2">Cost nature</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {voucher.lines.map((line, idx) => (
                <tr key={line.id} className="border-t border-border">
                  <td className="px-3 py-2 text-center text-text-muted">{idx + 1}</td>
                  <td className="px-3 py-2">{accountName(line.account_id)}</td>
                  <td className="px-3 py-2">{costCenterName(line.cost_center_id)}</td>
                  <td className="px-3 py-2 text-text-muted">{lineCostNatureLabel(line)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {line.entry_type === "DEBIT" ? Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {line.entry_type === "CREDIT" ? Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                  </td>
                  <td className="px-3 py-2 text-text-muted">{line.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-subtle">
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">
                  Totals
                </td>
                <td className="px-3 py-2 text-right font-semibold">{debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-semibold">{creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs font-semibold ${
                      moneyEquals(debitTotal, creditTotal) ? "text-status-success-foreground" : "text-status-danger-foreground"
                    }`}
                  >
                    {moneyEquals(debitTotal, creditTotal) ? "Balanced" : "Not Balanced"}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bill-Wise Details */}
      {hasBillWiseLines || billRefs.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-secondary">Bill-Wise Details</h3>
            <div className="flex flex-wrap gap-2">
              {(voucher.voucher_type || "").toUpperCase() === "RECEIPT" ||
              (voucher.voucher_type || "").toUpperCase() === "PAYMENT" ? (
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
                  onClick={async () => {
                    try {
                      // FIFO auto-allocate against party ledger (requires party_ledger_enabled)
                      const partyLine = (voucher.lines || []).find((l) => l.account_id);
                      if (!partyLine) throw new Error("No party account line on this voucher");
                      const match = await findPartyLedgerByAccount(partyLine.account_id);
                      if (!match) throw new Error("No party ledger linked to this voucher account");
                      const allocs = await api.autoAllocatePartyLedger({
                        party_ledger_id: match.id,
                        voucher_id: voucher.id,
                        method: "FIFO",
                      });
                      setSuccess(`Party ledger FIFO allocated ${allocs.length} bill(s).`);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Auto-allocate FIFO (party ledger)
                </button>
              ) : null}
              {voucher.status === "POSTED" && hasBillWiseLines ? (
              <button
                type="button"
                className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/20"
                onClick={async () => {
                  try {
                    const res = await api.autoCreateBillRefs(voucher.id);
                    setSuccess(`Auto-created ${res.bills_created} bill reference(s): ${res.bill_numbers.join(", ")}`);
                    await loadVoucher();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Auto-Create Bill References
              </button>
            ) : null}
            </div>
          </div>

          {billRefs.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left">
                  <tr>
                    <th className="px-3 py-2">Bill No</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Party</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Original</th>
                    <th className="px-3 py-2 text-right">Pending</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {billRefs.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.bill_number}</td>
                      <td className="px-3 py-2">{r.bill_type}</td>
                      <td className="px-3 py-2">{r.party_name}</td>
                      <td className="px-3 py-2">{r.account_name ?? `#${r.account_id}`}</td>
                      <td className="px-3 py-2 text-right">{Number(r.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right">{Number(r.pending_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.status === "OPEN"
                              ? "bg-blue-50 text-blue-700"
                              : r.status === "SETTLED"
                                ? "bg-green-50 text-green-700"
                                : "bg-yellow-50 text-yellow-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-muted">{r.due_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No bill references linked to this voucher yet. Use &quot;Auto-Create&quot; after posting to generate bill references for bill-wise enabled accounts.
            </p>
          )}
        </div>
      ) : null}

      {/* Audit Timeline */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-secondary">Audit Trail</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
            <div>
              <p className="text-sm text-text-primary">Voucher created</p>
              <p className="text-xs text-text-muted">{voucher.created_at}</p>
            </div>
          </div>
          {voucher.signed_at ? (
            <div className="flex items-start gap-3">
              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-status-success-foreground" />
              <div>
                <p className="text-sm text-text-primary">Digitally signed by system</p>
                <p className="text-xs text-text-muted">{voucher.signed_at}</p>
              </div>
            </div>
          ) : null}
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full border border-border bg-surface-subtle" />
            <div>
              <p className="text-sm text-text-primary">Current status: {voucher.status}</p>
              <p className="text-xs text-text-muted">Last updated {voucher.updated_at}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised p-4">
        {voucher.status === "DRAFT" || voucher.status === "REJECTED" ? (
          <button
            type="button"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            onClick={() => navigate(`/app/accounts/vouchers?edit=${voucher.id}`)}
          >
            Edit Voucher
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
          disabled={printLoading}
          onClick={async () => {
            if (!voucher) return;
            setPrintLoading(true);
            try {
              const d = await api.getVoucherPrint(voucher.id);
              setPrintData(d);
              setPrintOpen(true);
            } catch (e) {
              logApiError("VoucherDetailPage.print", e);
              setError((e as Error).message);
            } finally {
              setPrintLoading(false);
            }
          }}
        >
          {printLoading ? "Loading…" : "Print / PDF"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-dashed border-border-strong px-4 py-2 text-xs text-text-muted hover:bg-surface-subtle"
          onClick={() => navigate(`/app/accounts/vouchers/print?voucher_id=${voucher.id}`)}
        >
          Open print page
        </button>
        {directPostOn && ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED"].includes(voucher.status) ? (
          <button
            type="button"
            disabled={posting}
            className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm font-medium text-status-success-foreground disabled:opacity-50"
            title="Run every remaining approval step and post now (direct posting is on for this company)"
            onClick={async () => {
              setError(null);
              setSuccess(null);
              setPosting(true);
              try {
                await api.directPostVoucher(voucher.id);
                setSuccess("Voucher posted.");
                await loadVoucher();
              } catch (e) {
                setError((e as Error).message);
                await loadVoucher();
              } finally {
                setPosting(false);
              }
            }}
          >
            {posting ? "Posting…" : "Post now"}
          </button>
        ) : null}
        {(voucher.voucher_type || "").toUpperCase() === "PAYMENT" ? (
          <button
            type="button"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            onClick={() => navigate(`/app/accounts/vouchers/${voucher.id}/cheque`)}
          >
            Print cheque
          </button>
        ) : null}
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={posting && action === "post"}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
            onClick={() => void requestAction(action)}
          >
            {action === "post" && posting ? "Posting…" : ACTION_LABEL[action] ?? action}
          </button>
        ))}
        {voucher.status !== "POSTED" && voucher.status !== "REVERSED" ? (
          <button
            type="button"
            className="rounded-lg border border-status-danger/30 px-4 py-2 text-sm text-status-danger-foreground hover:bg-status-danger-subtle"
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
        ) : null}
      </div>

      {printOpen && printData && voucher ? (
        <PrintPreviewModal
          open={printOpen}
          title={`Print — ${voucher.voucher_number}`}
          onClose={() => {
            setPrintOpen(false);
            setPrintData(null);
          }}
          copyCount={printCopyCount}
          onCopyCountChange={setPrintCopyCount}
          template={printTemplate}
          onTemplateChange={setPrintTemplate}
        >
          <VoucherPrintSheets
            data={printData}
            copyCount={printCopyCount}
            template={printTemplate}
            verificationUrl={voucherPrintVerificationUrl(printData)}
          />
        </PrintPreviewModal>
      ) : null}

      <VoucherHistoryPanel voucherId={voucher.id} refreshKey={`${voucher.status}|${voucher.updated_at ?? ""}`} />

      <VoucherActionReasonModal
        open={pendingAction != null}
        title={pendingAction ? `Confirm ${ACTION_LABEL[pendingAction] ?? pendingAction}` : "Confirm"}
        description="A short reason helps your team during review. It is saved in the voucher's History."
        confirmLabel={pendingAction ? ACTION_LABEL[pendingAction] ?? "Confirm" : "Confirm"}
        onClose={() => setPendingAction(null)}
        onConfirm={(reason) => {
          if (!pendingAction) return;
          const a = pendingAction;
          setPendingAction(null);
          void runAction(a, reason);
        }}
      />

      {budgetOverrideOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <h3 className="text-base font-semibold text-text-primary">Budget override required</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Posting is blocked because this voucher exceeds the FINAL budget for the cost center / account.
              You need <code className="text-xs">finance.budget_override</code> and a mandatory reason.
            </p>
            {budgetPreflight?.warning_message ? (
              <p className="mt-2 rounded border border-status-danger/20 bg-status-danger-subtle px-2 py-1.5 text-xs text-status-danger-foreground">
                {budgetPreflight.warning_message}
              </p>
            ) : null}
            <label className="mt-3 block text-xs font-medium text-text-muted">Override reason</label>
            <textarea
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
              rows={3}
              value={budgetOverrideReason}
              onChange={(e) => setBudgetOverrideReason(e.target.value)}
              placeholder="Why is this over-budget spend allowed?"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-state-hover"
                onClick={() => {
                  setBudgetOverrideOpen(false);
                  setBudgetOverrideReason("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={posting || !budgetOverrideReason.trim()}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-brand-primary-foreground disabled:opacity-50"
                onClick={() => void runAction("post", budgetOverrideReason.trim(), { budget_override: true })}
              >
                {posting ? "Posting…" : "Override & post"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
