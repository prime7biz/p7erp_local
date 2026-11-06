import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api, type PublicDocumentVerification } from "@/api/client";

type State =
  | { kind: "loading" }
  | { kind: "result"; data: PublicDocumentVerification }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function formatAmount(value: string | null, currency: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  const text = Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
  return currency ? `${text} ${currency}` : text;
}

/** Public page opened by scanning the QR code on a printed voucher or inventory document. */
export function VerifyDocumentPage() {
  const { verificationId = "" } = useParams<{ verificationId: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const vid = verificationId.trim();
    if (!vid) {
      setState({ kind: "not_found" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    api
      .verifyDocumentPublic(vid)
      .then((data) => {
        if (!cancelled) setState({ kind: "result", data });
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setState({ kind: "not_found" });
        else setState({ kind: "error", message: e instanceof Error ? e.message : "Verification failed." });
      });
    return () => {
      cancelled = true;
    };
  }, [verificationId]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
        {state.kind === "loading" ? <p className="text-text-muted">Checking document…</p> : null}

        {state.kind === "not_found" ? (
          <>
            <h1 className="text-lg font-bold text-text-primary">Not found</h1>
            <p className="mt-2 text-sm text-text-muted">
              No document matches this code, or the issuing company has not turned on public verification. Ask the
              sender to confirm the document.
            </p>
          </>
        ) : null}

        {state.kind === "error" ? (
          <>
            <h1 className="text-lg font-bold text-text-primary">Could not verify right now</h1>
            <p className="mt-2 text-sm text-text-muted">{state.message} Please try again in a minute.</p>
          </>
        ) : null}

        {state.kind === "result" ? (
          <>
            {state.data.is_valid ? (
              <h1 className="text-lg font-bold text-status-success-foreground">Genuine document</h1>
            ) : (
              <h1 className="text-lg font-bold text-status-danger-foreground">Document changed after signing</h1>
            )}
            <p className="mt-2 text-sm text-text-secondary">
              {state.data.is_valid ? (
                <>
                  This {state.data.document_label.toLowerCase()} was issued by <strong>{state.data.company_name}</strong>{" "}
                  and matches their records.
                </>
              ) : (
                <>
                  The record at <strong>{state.data.company_name}</strong> no longer matches its signature. Do not rely
                  on this paper; contact the company.
                </>
              )}
            </p>
            <ul className="mt-4 space-y-1 text-sm text-text-secondary">
              <li>
                <span className="font-medium">Document:</span> {state.data.document_label}
              </li>
              <li>
                <span className="font-medium">Number:</span> {state.data.document_number ?? "—"}
              </li>
              <li>
                <span className="font-medium">Date:</span> {formatDate(state.data.document_date)}
              </li>
              <li>
                <span className="font-medium">Status:</span> {state.data.status ?? "—"}
              </li>
              {state.data.amount != null ? (
                <li>
                  <span className="font-medium">Amount:</span> {formatAmount(state.data.amount, state.data.currency)}
                </li>
              ) : null}
              {state.data.quantity != null ? (
                <li>
                  <span className="font-medium">Total quantity:</span> {state.data.quantity}
                  {state.data.line_count != null ? ` (${state.data.line_count} line${state.data.line_count === 1 ? "" : "s"})` : ""}
                </li>
              ) : null}
              <li>
                <span className="font-medium">Verification ID:</span> {verificationId}
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
