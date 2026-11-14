/** Budget revisions: requested changes to FINAL budgets; a second person approves or rejects. */
import { useState } from "react";
import { mgmtPerformanceApi, type Paged, type RevisionItem } from "@/api/mgmtPerformance";
import { LoadingBlock, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { logApiError } from "@/utils/logApiError";
import { ActionsMenu, Chip, Dialog, Empty, Field, buttonClass, fieldClass, primaryButtonClass, tableWrap, td, tdR, th, thR } from "./MpParts";
import { money } from "./mgmtPerformanceLogic";

export function RevisionsView() {
  const [status, setStatus] = useState<RevisionItem["status"] | "">("PENDING");
  const [decide, setDecide] = useState<{ item: RevisionItem; decision: "approve" | "reject" } | null>(null);
  const res = useStatementResource<Paged<RevisionItem>>("mp.revisions", status, () =>
    mgmtPerformanceApi.getRevisions({ status: status || undefined, limit: 200 }),
  );
  return (
    <div className="space-y-4">
      <label className="text-xs font-medium text-text-muted">
        Status
        <select className={`${fieldClass} ml-2`} value={status} onChange={(e) => setStatus(e.target.value as RevisionItem["status"] | "")}>
          <option value="PENDING">Waiting for approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </select>
      </label>
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !res.data ? <LoadingBlock label="Loading budget revisions" /> : null}
      {res.data ? (
        res.data.items.length === 0 ? (
          <Empty>No budget revisions. Use “Request budget change” in the Budget forecast table.</Empty>
        ) : (
          <div className={tableWrap}>
            <table className="min-w-full text-sm" aria-label="Budget revisions">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Month</th>
                  <th className={th}>Kind</th>
                  <th className={thR}>Old amount</th>
                  <th className={thR}>New amount</th>
                  <th className={th}>Reason</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-border-subtle" data-testid="revision-row">
                    <td className={td}>{r.id}</td>
                    <td className={td}>{r.period_month}</td>
                    <td className={td}>{r.kind === "CHANGE" ? "Change line" : "New line"}</td>
                    <td className={tdR}>{money(r.old_amount)}</td>
                    <td className={tdR}>{money(r.new_amount)}</td>
                    <td className={`${td} max-w-xs text-xs`}>
                      {r.reason}
                      {r.decision_note ? <span className="block text-text-muted">Decision: {r.decision_note}</span> : null}
                    </td>
                    <td className={td}>
                      <Chip status={r.status === "PENDING" ? "OPEN" : r.status} label={r.status.toLowerCase()} />
                    </td>
                    <td className={td}>
                      <ActionsMenu
                        items={
                          r.can_decide
                            ? [
                                { id: "approve", label: "Approve" },
                                { id: "reject", label: "Reject", danger: true },
                              ]
                            : []
                        }
                        onPick={(id) => setDecide({ item: r, decision: id as "approve" | "reject" })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {decide ? (
        <DecideDialog
          item={decide.item}
          decision={decide.decision}
          onClose={() => setDecide(null)}
          onDone={() => {
            setDecide(null);
            res.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function DecideDialog({ item, decision, onClose, onDone }: { item: RevisionItem; decision: "approve" | "reject"; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = decision === "approve" || note.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await mgmtPerformanceApi.decideRevision(item.id, decision, note.trim() || undefined);
      onDone();
    } catch (e) {
      logApiError(`mgmtPerformance.revision.${decision}`, e);
      setError((e as Error).message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={decision === "approve" ? "Approve budget change" : "Reject budget change"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButtonClass} disabled={!valid || busy} onClick={() => void submit()}>
            {busy ? "Saving…" : decision === "approve" ? "Approve and apply" : "Reject"}
          </button>
        </>
      }
    >
      <p className="text-text-secondary">
        {item.period_month}: {money(item.old_amount)} → {money(item.new_amount)}. {item.reason}
      </p>
      {decision === "approve" ? (
        <p className="text-xs text-text-muted">The budget line changes right away; the old amount stays in this history.</p>
      ) : null}
      <Field label={decision === "reject" ? "Why? (required)" : "Note (optional)"}>
        <textarea className={`${fieldClass} w-full`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-status-danger-foreground">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
