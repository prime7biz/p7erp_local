/** Budget exceptions: owner answers -> finance reviews -> manager approves (four-eyes is checked on the server). */
import { useMemo, useState } from "react";
import { mgmtPerformanceApi, type ExceptionItem, type ExceptionStatus, type MpAccess, type Paged } from "@/api/mgmtPerformance";
import { LoadingBlock, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { logApiError } from "@/utils/logApiError";
import { ActionsMenu, Chip, Dialog, Empty, Field, buttonClass, fieldClass, primaryButtonClass, tableWrap, td, tdR, th, thR } from "./MpParts";
import { exceptionActions, isDecimalText, money, newRequestId, type ExceptionDialog } from "./mgmtPerformanceLogic";

const SEVERITY_TEXT: Record<string, string> = { WARNING: "Warning", AT_RISK: "At risk", FAILED: "Over budget" };
const FAMILY_TEXT: Record<string, string> = { BUDGET: "Budget", UNBUDGETED: "No budget", UNMAPPED: "No category" };

export function ExceptionsView({ access, month }: { access: MpAccess; month?: string }) {
  const [status, setStatus] = useState<ExceptionStatus | "">("");
  const [dialog, setDialog] = useState<{ item: ExceptionItem; kind: ExceptionDialog } | null>(null);
  const [scanMsg, setScanMsg] = useState("");
  const [scanning, setScanning] = useState(false);
  const res = useStatementResource<Paged<ExceptionItem>>("mp.exceptions", `${month ?? ""}|${status}`, () =>
    mgmtPerformanceApi.getExceptions({ month, status: status || undefined, limit: 200 }),
  );

  async function scan() {
    setScanning(true);
    setScanMsg("");
    try {
      const r = await mgmtPerformanceApi.scanExceptions();
      setScanMsg(`Checked: ${r.created} new, ${r.escalated} worse than before.`);
      res.reload();
    } catch (e) {
      logApiError("mgmtPerformance.scan", e);
      setScanMsg((e as Error).message || "The check failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-medium text-text-muted">
          Status
          <select className={`${fieldClass} ml-2`} value={status} onChange={(e) => setStatus(e.target.value as ExceptionStatus | "")}>
            <option value="">All</option>
            <option value="OPEN">Waiting for an answer</option>
            <option value="RESPONDED">Waiting for finance review</option>
            <option value="REVIEWED">Waiting for approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        {access.can_review ? (
          <div className="flex items-center gap-2">
            {scanMsg ? <span className="text-xs text-text-muted">{scanMsg}</span> : null}
            <button type="button" className={buttonClass} disabled={scanning} onClick={() => void scan()}>
              {scanning ? "Checking…" : "Check budgets now"}
            </button>
          </div>
        ) : null}
      </div>
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !res.data ? <LoadingBlock label="Loading exceptions" /> : null}
      {res.data ? (
        res.data.items.length === 0 ? (
          <Empty>No budget exceptions. The system checks every night; finance can also run the check now.</Empty>
        ) : (
          <div className={tableWrap}>
            <table className="min-w-full text-sm" aria-label="Budget exceptions">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className={th}>Month</th>
                  <th className={th}>Cost centre / category</th>
                  <th className={th}>Problem</th>
                  <th className={thR}>Budget</th>
                  <th className={thR}>Forecast</th>
                  <th className={th}>Answer</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((it) => (
                  <tr key={it.id} className="border-t border-border-subtle" data-testid="exception-row">
                    <td className={td}>{it.period_month}</td>
                    <td className={td}>
                      {it.cost_center_label}
                      <span className="block text-[11px] text-text-muted">{it.category_label}</span>
                    </td>
                    <td className={td}>
                      <Chip status={it.severity} label={`${FAMILY_TEXT[it.family]} · ${SEVERITY_TEXT[it.severity]}`} />
                    </td>
                    <td className={tdR}>{it.restricted ? "—" : money(it.budget_amount)}</td>
                    <td className={tdR}>{it.restricted ? "—" : money(it.forecast_amount)}</td>
                    <td className={`${td} max-w-xs text-xs`}>
                      {it.reason ? (
                        <>
                          <span className="block">{it.reason}</span>
                          <span className="block text-text-muted">Action: {it.corrective_action}</span>
                        </>
                      ) : (
                        <span className="text-text-muted">Not answered yet</span>
                      )}
                      {it.decision_note ? <span className="block text-text-muted">Decision: {it.decision_note}</span> : null}
                    </td>
                    <td className={td}>
                      <Chip status={it.status} label={it.status.toLowerCase()} />
                    </td>
                    <td className={td}>
                      <ActionsMenu items={exceptionActions(it)} onPick={(id) => setDialog({ item: it, kind: id as ExceptionDialog })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {dialog ? (
        <ActionDialog
          item={dialog.item}
          kind={dialog.kind}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            res.reload();
          }}
        />
      ) : null}
    </div>
  );
}

const TITLES: Record<ExceptionDialog, string> = {
  respond: "Answer this budget item",
  review: "Finance review",
  approve: "Approve the answer",
  reject: "Reject the answer",
};

function ActionDialog({ item, kind, onClose, onDone }: { item: ExceptionItem; kind: ExceptionDialog; onClose: () => void; onDone: () => void }) {
  const requestId = useMemo(() => newRequestId("exc"), []);
  const [reason, setReason] = useState(item.reason ?? "");
  const [action, setAction] = useState(item.corrective_action ?? "");
  const [revised, setRevised] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid =
    kind === "respond"
      ? reason.trim().length >= 3 && action.trim().length >= 3 && (revised.trim() === "" || isDecimalText(revised))
      : kind === "reject"
        ? note.trim().length >= 3
        : true;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await mgmtPerformanceApi.actOnException(
        item.id,
        kind,
        kind === "respond"
          ? { request_id: requestId, reason: reason.trim(), corrective_action: action.trim(), revised_forecast: revised.trim() || undefined }
          : { request_id: requestId, note: note.trim() || undefined },
      );
      onDone();
    } catch (e) {
      logApiError(`mgmtPerformance.exception.${kind}`, e);
      setError((e as Error).message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={TITLES[kind]}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButtonClass} disabled={!valid || busy} onClick={() => void submit()}>
            {busy ? "Saving…" : kind === "reject" ? "Reject" : kind === "approve" ? "Approve" : "Save"}
          </button>
        </>
      }
    >
      <p className="text-text-secondary">
        {item.period_month} · {item.cost_center_label} · {item.category_label}
      </p>
      {kind === "respond" ? (
        <>
          <Field label="Why is this over / at risk?">
            <textarea className={`${fieldClass} w-full`} rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="What will you do about it?">
            <textarea className={`${fieldClass} w-full`} rows={3} maxLength={2000} value={action} onChange={(e) => setAction(e.target.value)} />
          </Field>
          <Field label="Your revised forecast for the month (optional)">
            <input className={`${fieldClass} w-full`} inputMode="decimal" value={revised} onChange={(e) => setRevised(e.target.value)} />
          </Field>
        </>
      ) : (
        <>
          {item.reason ? (
            <div className="rounded-lg bg-surface-subtle p-3 text-xs">
              <p>
                <b>Reason:</b> {item.reason}
              </p>
              <p className="mt-1">
                <b>Action:</b> {item.corrective_action}
              </p>
              {item.revised_forecast ? (
                <p className="mt-1">
                  <b>Revised forecast:</b> {money(item.revised_forecast)}
                </p>
              ) : null}
            </div>
          ) : null}
          <Field label={kind === "reject" ? "Why is it rejected? (required)" : "Note (optional)"}>
            <textarea className={`${fieldClass} w-full`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      {error ? (
        <p role="alert" className="text-xs text-status-danger-foreground">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
