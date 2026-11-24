import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  customerPortalQuotationsApi,
  newPortalRequestId,
  portalQuotationsEnabled,
  type PortalQuotation,
  type PortalQuotationResponseType,
} from "@/api/customerPortalQuotations";
import type { PortalOutletContext } from "@/types/portalOutlet";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { erpControlFocusClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm font-medium text-text-primary">{value}</dd>
    </div>
  );
}

export function CustomerQuotationDetailPage() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const { me } = useOutletContext<PortalOutletContext>();
  const enabled = portalQuotationsEnabled(me?.feature_flags as Record<string, unknown> | undefined);
  // Same rule as the backend: only the collaborator role may answer.
  const canRespond = me?.role_codes?.includes("customer_collaborator") === true;

  const [q, setQ] = useState<PortalQuotation | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<PortalQuotationResponseType>("ACCEPT");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  // One request id per answer attempt: a double click is then a replay, not a second answer.
  const requestId = useRef(newPortalRequestId());

  async function load() {
    const id = Number(quotationId);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("Invalid quotation.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setQ(await customerPortalQuotationsApi.get(id));
      setErr("");
    } catch (e) {
      logApiError("CustomerQuotationDetailPage.get", e);
      setErr(e instanceof Error ? e.message : "Failed to load quotation");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, quotationId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q || busy) return;
    if (choice === "REQUEST_REVISION" && !note.trim()) {
      setErr("Please say what should change.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await customerPortalQuotationsApi.respond(q.id, {
        response_type: choice,
        note: note.trim() || null,
        request_id: requestId.current,
      });
      requestId.current = newPortalRequestId();
      setNote("");
      setDone(choice === "ACCEPT" ? "Thank you. Your acceptance was sent." : "Your revision request was sent.");
      await load();
    } catch (ex) {
      logApiError("CustomerQuotationDetailPage.respond", ex);
      setErr(ex instanceof Error ? ex.message : "Could not send your answer");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div>
        <AppPageHeader title="Quotation" description="" />
        <p className="text-sm text-text-muted">Quotations are not enabled for this organization.</p>
      </div>
    );
  }
  if (loading && !q) return <p className="p-6 text-sm text-text-muted">Loading…</p>;
  if (err && !q) return <PortalErrorState message={err} onRetry={() => void load()} />;
  if (!q) return null;

  const cur = q.currency ?? "";
  const accepted = q.my_last_response === "ACCEPT";

  return (
    <div className="space-y-5">
      <AppPageHeader title={`Quotation ${q.quotation_code}`} description={`Version ${q.version_no}`} />
      <Link to="/portal/customer/quotations" className="text-xs text-brand-primary hover:underline">
        ← Back to quotations
      </Link>

      <dl className="grid gap-4 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-3">
        <Field label="Style" value={q.style_ref ?? "—"} />
        <Field label="Quantity" value={q.quantity != null ? String(q.quantity) : "—"} />
        <Field label="Valid until" value={q.valid_until ?? "—"} />
        <Field label="Unit price" value={`${q.quoted_unit_price ?? "—"} ${cur}`.trim()} />
        <Field label="Total" value={`${q.total_amount ?? "—"} ${cur}`.trim()} />
        <div>
          <dt className="text-xs text-text-muted">Your answer</dt>
          <dd>
            {q.my_last_response ? (
              <Badge variant="secondary">{accepted ? "Accepted" : "Revision requested"}</Badge>
            ) : (
              <span className="text-sm text-text-muted">Waiting</span>
            )}
          </dd>
        </div>
      </dl>

      {done ? (
        <p role="status" className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
          {done}
        </p>
      ) : null}
      {err ? (
        <p role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm">
          {err}
        </p>
      ) : null}

      {!canRespond ? (
        <p className="text-sm text-text-muted">Your role can view quotations but not answer them.</p>
      ) : accepted ? (
        <p className="text-sm text-text-muted">You have already accepted this quotation.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1 text-sm font-medium text-text-primary">Your answer</legend>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="resp" checked={choice === "ACCEPT"} onChange={() => setChoice("ACCEPT")} />
              Accept
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="resp"
                checked={choice === "REQUEST_REVISION"}
                onChange={() => setChoice("REQUEST_REVISION")}
              />
              Request revision
            </label>
          </fieldset>
          <label className="block text-sm">
            <span className="text-text-secondary">
              Note {choice === "REQUEST_REVISION" ? "(required)" : "(optional)"}
            </span>
            <textarea
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send answer"}
          </Button>
        </form>
      )}
    </div>
  );
}
