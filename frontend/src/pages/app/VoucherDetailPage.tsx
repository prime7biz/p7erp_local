import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  api,
  type VoucherResponse,
  type ChartOfAccountResponse,
  type CostCenterResponse,
  type BillReferenceRow,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LinkedRecordsSection, type LinkedRecordRow } from "@/components/app/LinkedRecordsSection";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { logApiError } from "@/utils/logApiError";

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
  const { voucherId } = useParams<{ voucherId: string }>();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState<VoucherResponse | null>(null);
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

  const loadVoucher = useCallback(async () => {
    const id = Number(voucherId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid voucher ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [v, a, c] = await Promise.all([
        api.getVoucher(id),
        api.listChartOfAccounts({ active_only: false }),
        api.listCostCenters({ active_only: false }),
      ]);
      setVoucher(v);
      setAccounts(a);
      setCostCenters(c);
      try {
        const meta = await api.getVoucherAvailableActions(id);
        setActions(meta.actions);
      } catch {
        setActions([]);
      }
      try {
        const refs = await api.listBillReferences();
        setBillRefs(refs.filter((r) => r.source_voucher_id === id));
      } catch {
        setBillRefs([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [voucherId]);

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

  const runAction = useCallback(
    async (action: string, reason: string) => {
      if (!voucher) return;
      setError(null);
      setSuccess(null);
      try {
        if (action === "post") {
          const posted = await api.postVoucher(voucher.id);
          if (posted.control_warnings?.length) {
            setSuccess(
              `Posted. Review: ${posted.control_warnings.join(" ")}`,
            );
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
          await api.updateVoucherStatus(voucher.id, nextStatus);
        }
        const label = ACTION_LABEL[action] ?? action;
        setSuccess(reason.trim() ? `Action complete: ${label} — ${reason.trim()}` : `Action complete: ${label}`);
        await loadVoucher();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [voucher, loadVoucher],
  );

  function requestAction(action: string) {
    if (ACTIONS_NEEDING_REASON.has(action)) {
      setPendingAction(action);
      return;
    }
    void runAction(action, "");
  }

  async function handleDelete() {
    if (!voucher) return;
    if (!window.confirm("Delete this voucher permanently?")) return;
    try {
      await api.deleteVoucher(voucher.id);
      navigate("/app/accounts/vouchers");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const debitTotal = useMemo(() => {
    if (!voucher) return 0;
    return voucher.lines.filter((l) => l.entry_type === "DEBIT").reduce((s, l) => s + Number(l.amount || 0), 0);
  }, [voucher]);

  const creditTotal = useMemo(() => {
    if (!voucher) return 0;
    return voucher.lines.filter((l) => l.entry_type === "CREDIT").reduce((s, l) => s + Number(l.amount || 0), 0);
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
                <td colSpan={3} className="px-3 py-2 text-right font-semibold">
                  Totals
                </td>
                <td className="px-3 py-2 text-right font-semibold">{debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-semibold">{creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs font-semibold ${
                      Math.abs(debitTotal - creditTotal) < 0.001 ? "text-status-success-foreground" : "text-status-danger-foreground"
                    }`}
                  >
                    {Math.abs(debitTotal - creditTotal) < 0.001 ? "Balanced" : "Not Balanced"}
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
          onClick={() => navigate(`/app/accounts/vouchers/print?voucher_id=${voucher.id}`)}
        >
          Print / PDF
        </button>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            onClick={() => requestAction(action)}
          >
            {ACTION_LABEL[action] ?? action}
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

      <VoucherActionReasonModal
        open={pendingAction != null}
        title={pendingAction ? `Confirm ${ACTION_LABEL[pendingAction] ?? pendingAction}` : "Confirm"}
        description="A short reason helps your team during review. Full audit storage in the database is planned (see docs/voucher_backend_gaps.md)."
        confirmLabel={pendingAction ? ACTION_LABEL[pendingAction] ?? "Confirm" : "Confirm"}
        onClose={() => setPendingAction(null)}
        onConfirm={(reason) => {
          if (!pendingAction) return;
          const a = pendingAction;
          setPendingAction(null);
          void runAction(a, reason);
        }}
      />
    </div>
  );
}
