import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { mfgAdvancedPlanningApi, type SchedulerConvertResponse, type SchedulerParams } from "@/api/mfgAdvancedPlanning";
import { logApiError } from "@/utils/logApiError";

import { ErrorBox, inputCls, labelCls, primaryBtn, secondaryBtn } from "../phase2/Phase2Ui";
import { NOTE_MAX, NOTE_MIN, convertErrorText, convertNoteError, isProposalStale, isValidRequestId, newSchedulerRequestId } from "./phase5Logic";

/**
 * "Create plan revision" for the whole current scheduler proposal. Mount it only while open: the request id is made
 * once per dialog, so a double click or a retry replays the same revision instead of creating a second one.
 */
export function ConvertProposalDialog({
  params,
  proposalHash,
  itemCount,
  onClose,
  onDone,
  onStale,
}: {
  params: SchedulerParams;
  proposalHash: string;
  itemCount: number;
  onClose: () => void;
  onDone: (rev: SchedulerConvertResponse) => void;
  /** 409 PROPOSAL_STALE: the parent re-runs the preview and shows the message. */
  onStale: (message: string) => void;
}) {
  const titleId = useId();
  const noteId = useId();
  const [requestId] = useState(newSchedulerRequestId);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  const noteErr = convertNoteError(note);
  const idOk = isValidRequestId(requestId);

  const submit = async () => {
    setTouched(true);
    if (noteErr || !idOk || pending) return;
    setPending(true);
    setError("");
    try {
      const rev = await mfgAdvancedPlanningApi.convertProposal({ params, proposal_hash: proposalHash, note: note.trim(), request_id: requestId });
      onDone(rev);
    } catch (e) {
      logApiError("ConvertProposalDialog.submit", e);
      if (isProposalStale(e)) {
        onStale(convertErrorText(e));
        return;
      }
      setError(convertErrorText(e));
    } finally {
      setPending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[115] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="mfg-convert-dialog"
        className="relative w-full max-w-md space-y-3 rounded-t-xl bg-surface-raised p-4 shadow-2xl sm:rounded-xl"
      >
        <h2 id={titleId} className="text-base font-semibold text-text-primary">
          Create plan revision
        </h2>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            Sends the whole proposal ({itemCount} change{itemCount === 1 ? "" : "s"}) to <strong>Plan changes</strong> as a proposed revision. Nothing
            moves until someone with plan approval rights approves it.
          </p>
          <p className="text-xs text-text-muted">If the line plan changed since the preview, you will be asked to run the preview again.</p>
        </div>
        <div>
          <label htmlFor={noteId} className={labelCls}>
            Note for the approver * ({NOTE_MIN}-{NOTE_MAX} characters)
          </label>
          <textarea
            id={noteId}
            rows={3}
            maxLength={NOTE_MAX + 50}
            className={inputCls}
            value={note}
            placeholder="Why should the plan change? e.g. Recover late orders for buyer X"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {touched && noteErr ? <p className="mt-1 text-[11px] text-red-700">{noteErr}</p> : null}
        </div>
        {!idOk ? <ErrorBox message="Could not prepare this request. Close the dialog and open it again." /> : null}
        <ErrorBox message={error} testId="mfg-convert-error" />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={() => onCloseRef.current()}>
            Cancel
          </button>
          <button type="button" className={primaryBtn} disabled={pending || Boolean(noteErr) || !idOk} onClick={() => void submit()}>
            {pending ? "Working…" : "Create plan revision"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
