import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type VoucherResponse, type ChartOfAccountResponse, type CostCenterResponse, type BillReferenceRow } from "@/api/client";

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
};

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

  async function takeAction(action: string) {
    if (!voucher) return;
    setError(null);
    setSuccess(null);
    try {
      if (action === "post") await api.postVoucher(voucher.id);
      else if (action === "reverse") await api.reverseVoucher(voucher.id);
      else {
        const nextStatus = ACTION_TO_STATUS[action];
        if (!nextStatus) throw new Error(`Unsupported action: ${action}`);
        await api.updateVoucherStatus(voucher.id, nextStatus);
      }
      setSuccess(`Action complete: ${ACTION_LABEL[action] ?? action}`);
      await loadVoucher();
    } catch (e) {
      setError((e as Error).message);
    }
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

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-muted">Loading voucher...</div>;
  if (!voucher) return <div className="py-16 text-center text-sm text-text-muted">{error ?? "Voucher not found."}</div>;

  const debitTotal = voucher.lines.filter((l) => l.entry_type === "DEBIT").reduce((s, l) => s + Number(l.amount || 0), 0);
  const creditTotal = voucher.lines.filter((l) => l.entry_type === "CREDIT").reduce((s, l) => s + Number(l.amount || 0), 0);
  const stepIndex = WORKFLOW_STEPS.indexOf(voucher.status);
  const hasBillWiseLines = voucher.lines.some((l) => billWiseAccountIds.has(l.account_id));

  return (
    <div className="space-y-6">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle" onClick={() => navigate("/app/accounts/vouchers")}>
          &larr; Back
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-text-primary">{voucher.voucher_number}</h1>
          <p className="text-xs text-text-muted">{voucher.voucher_type} Voucher | Created {voucher.created_at}</p>
        </div>
        <StatusBadge status={voucher.status} />
      </div>

      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      {/* Approval Stepper */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-secondary">Approval Progress</h3>
        <div className="flex items-center gap-1">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isDone = stepIndex >= idx;
            const isCurrent = stepIndex === idx;
            return (
              <div key={step} className="flex flex-1 items-center">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCurrent ? "bg-brand-primary text-brand-primary-foreground ring-2 ring-brand-primary/30" : isDone ? "bg-status-success-subtle text-status-success-foreground" : "bg-surface-subtle text-text-muted"}`}>
                  {isDone && !isCurrent ? "✓" : idx + 1}
                </div>
                <div className="ml-2 hidden text-xs sm:block">
                  <p className={`font-medium ${isCurrent ? "text-brand-primary" : isDone ? "text-status-success-foreground" : "text-text-muted"}`}>{step}</p>
                </div>
                {idx < WORKFLOW_STEPS.length - 1 ? <div className={`mx-2 h-px flex-1 ${isDone ? "bg-status-success-foreground/30" : "bg-border"}`} /> : null}
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
          <div><span className="text-text-muted">Voucher Number</span><div className="font-semibold text-text-primary">{voucher.voucher_number}</div></div>
          <div><span className="text-text-muted">Type</span><div className="font-semibold text-text-primary">{voucher.voucher_type}</div></div>
          <div><span className="text-text-muted">Date</span><div className="font-semibold text-text-primary">{voucher.voucher_date}</div></div>
          <div><span className="text-text-muted">Reference</span><div className="font-semibold text-text-primary">{voucher.reference ?? "—"}</div></div>
          <div><span className="text-text-muted">Currency</span><div className="font-semibold text-text-primary">{voucher.currency}{voucher.currency !== voucher.base_currency ? ` (Base: ${voucher.base_currency}, Rate: ${voucher.exchange_rate})` : ""}</div></div>
          <div><span className="text-text-muted">FX Rate Source</span><div className="font-semibold text-text-primary">{voucher.exchange_rate_source || "—"}</div></div>
          <div className="md:col-span-3"><span className="text-text-muted">Narration</span><div className="font-semibold text-text-primary">{voucher.description ?? "—"}</div></div>
          {voucher.verification_id ? (
            <div className="md:col-span-3">
              <span className="text-text-muted">Verification ID</span>
              <div className="font-mono text-xs text-text-primary">{voucher.verification_id}</div>
              <div className="mt-1 text-xs text-text-muted">{voucher.signed_by_system ? "Digitally signed" : "Not signed"}{voucher.signed_at ? ` at ${voucher.signed_at}` : ""}</div>
            </div>
          ) : null}
        </div>
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
                  <td className="px-3 py-2 text-right font-medium">{line.entry_type === "DEBIT" ? Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}</td>
                  <td className="px-3 py-2 text-right font-medium">{line.entry_type === "CREDIT" ? Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}</td>
                  <td className="px-3 py-2 text-text-muted">{line.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-subtle">
                <td colSpan={3} className="px-3 py-2 text-right font-semibold">Totals</td>
                <td className="px-3 py-2 text-right font-semibold">{debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-semibold">{creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-semibold ${Math.abs(debitTotal - creditTotal) < 0.001 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
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
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status === "OPEN" ? "bg-blue-50 text-blue-700" : r.status === "SETTLED" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
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
            <p className="text-sm text-text-muted">No bill references linked to this voucher yet. Use "Auto-Create" after posting to generate bill references for bill-wise enabled accounts.</p>
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
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-surface-subtle border border-border" />
            <div>
              <p className="text-sm text-text-primary">Current status: {voucher.status}</p>
              <p className="text-xs text-text-muted">Last updated {voucher.updated_at}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised p-4">
        {(voucher.status === "DRAFT" || voucher.status === "REJECTED") ? (
          <button type="button" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle" onClick={() => navigate(`/app/accounts/vouchers?edit=${voucher.id}`)}>
            Edit Voucher
          </button>
        ) : null}
        <button type="button" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle" onClick={() => navigate(`/app/accounts/vouchers/print?voucher_id=${voucher.id}`)}>
          Print / PDF
        </button>
        {actions.map((action) => (
          <button key={action} type="button" className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle" onClick={() => void takeAction(action)}>
            {ACTION_LABEL[action] ?? action}
          </button>
        ))}
        {(voucher.status !== "POSTED" && voucher.status !== "REVERSED") ? (
          <button type="button" className="rounded-lg border border-status-danger/30 px-4 py-2 text-sm text-status-danger-foreground hover:bg-status-danger-subtle" onClick={() => void handleDelete()}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
