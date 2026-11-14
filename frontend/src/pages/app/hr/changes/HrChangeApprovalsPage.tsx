/**
 * HR → Payroll → Employee changes: Tier 1 / Tier 2 approval of amendments to existing employees
 * (tenant flag `hr_employee_change_approval`). The server enforces every rule; buttons only follow it.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HrChangeRequest, type HrChangeRequestRights } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrRowActions } from "@/components/hr/kit/HrRowActions";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import {
  decisionTier,
  diffRows,
  isOpen,
  KIND_LABELS,
  STATUS_LABELS,
} from "@/components/hr/changeRequests/changeRequestLogic";
import { cn } from "@/lib/utils";

type View = "tier1" | "tier2" | "mine" | "all";

const VIEWS: { id: View; label: string }[] = [
  { id: "tier1", label: "Waiting for me (Tier 1)" },
  { id: "tier2", label: "Waiting for me (Tier 2)" },
  { id: "mine", label: "My requests" },
  { id: "all", label: "History" },
];

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function Details({
  request,
  tier,
  onClose,
  onDecided,
}: {
  request: HrChangeRequest;
  tier: 1 | 2 | null;
  onClose: () => void;
  onDecided: (r: HrChangeRequest, text: string) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = diffRows(request);

  const decide = async (decision: "APPROVE" | "REJECT") => {
    if (!tier) return;
    if (decision === "REJECT" && !note.trim()) {
      setError("Write why you reject it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.decideHrChangeRequest(request.id, tier, { decision, note: note.trim() || null });
      onDecided(r, decision === "REJECT" ? "Change rejected." : r.status === "APPLIED" ? "Change approved and applied." : r.status === "FAILED" ? `Could not apply: ${r.failure_reason ?? ""}` : "Approved; now waiting for Tier 2.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decision failed");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Change #${request.id}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface-raised p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">
          Change #{request.id}: {KIND_LABELS[request.kind]}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          <Link to={`/app/hr/employees/${request.employee_id}/profile`} className="text-brand-primary hover:underline">
            {request.employee_code} {request.employee_name}
          </Link>{" "}
          · {STATUS_LABELS[request.status]}
        </p>
        <p className="mt-2 text-sm text-text-primary">
          <span className="text-text-muted">Reason: </span>
          {request.reason}
        </p>
        <div className="mt-4">
          {request.details_hidden ? (
            <p className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-muted">
              Pay details are hidden for your role.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-muted">No field details.</p>
          ) : (
            <table className="min-w-full text-sm" aria-label="Before and after">
              <thead className="bg-surface-subtle text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Field</th>
                  <th className="px-3 py-2 text-left font-medium">Now</th>
                  <th className="px-3 py-2 text-left font-medium">Requested</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.field} className="border-t border-border">
                    <td className="px-3 py-1.5 text-text-secondary">{r.label}</td>
                    <td className="px-3 py-1.5 text-text-muted">{r.before}</td>
                    <td className="px-3 py-1.5 font-medium text-text-primary">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-xs text-text-secondary sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">Requested</dt>
            <dd>{when(request.requested_at)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Tier 1</dt>
            <dd>
              {when(request.tier1_at)}
              {request.tier1_note ? ` — ${request.tier1_note}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Tier 2</dt>
            <dd>
              {when(request.tier2_at)}
              {request.tier2_note ? ` — ${request.tier2_note}` : ""}
            </dd>
          </div>
        </dl>
        {request.failure_reason && (
          <p className="mt-3 rounded border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
            {request.failure_reason}
          </p>
        )}
        {tier && (
          <label className="mt-4 block text-sm text-text-secondary">
            Note {`(Tier ${tier}; required to reject)`}
            <textarea
              className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="mt-2 text-sm text-status-danger-foreground" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
            Close
          </button>
          {tier && (
            <>
              <button
                type="button"
                onClick={() => void decide("REJECT")}
                disabled={busy}
                className="rounded border border-status-danger px-4 py-1.5 text-sm font-semibold text-status-danger disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => void decide("APPROVE")}
                disabled={busy}
                className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Saving…" : tier === 2 ? "Approve and apply" : "Approve (Tier 1)"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function HrChangeApprovalsPage() {
  const [rights, setRights] = useState<HrChangeRequestRights | null>(null);
  const [view, setView] = useState<View>("tier1");
  const [rows, setRows] = useState<HrChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [open, setOpen] = useState<HrChangeRequest | null>(null);

  useEffect(() => {
    api
      .getHrChangeRequestRights()
      .then((r) => {
        setRights(r);
        if (!r.can_tier1 && r.can_tier2) setView("tier2");
        else if (!r.can_tier1 && !r.can_tier2) setView("mine");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const load = useCallback(async (v: View) => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrChangeRequests({ view: v, limit: 200 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load changes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rights) void load(view);
  }, [rights, view, load]);

  const cancel = async (r: HrChangeRequest) => {
    if (!window.confirm(`Cancel change #${r.id}?`)) return;
    setError("");
    try {
      await api.cancelHrChangeRequest(r.id);
      setInfo(`Change #${r.id} cancelled.`);
      await load(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  const actions = (r: HrChangeRequest): HrRowAction[] => {
    const tier = rights ? decisionTier(r, rights) : null;
    const list: HrRowAction[] = [
      { key: "open", label: tier ? `Review (Tier ${tier})` : "Details", primary: true, tone: tier ? "positive" : "neutral", onClick: () => setOpen(r) },
    ];
    if (isOpen(r) && rights && r.requested_by === rights.user_id) {
      list.push({ key: "cancel", label: "Cancel request", danger: true, onClick: () => void cancel(r) });
    }
    return list;
  };

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Employee changes"
        description="Changes to existing employees wait here for Tier 1 and then Tier 2 approval before they apply."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Employee changes" }]}
      />
      {rights && !rights.enabled && (
        <p className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-text-secondary">
          Employee change approval is switched off (Settings → Configuration). Changes are saved directly.
        </p>
      )}
      {rights && !rights.can_tier1 && !rights.can_tier2 && (
        <p className="text-xs text-text-muted">You do not hold a Tier 1 or Tier 2 approval permission; you can follow your own requests.</p>
      )}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Change request lists">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => {
              setInfo("");
              setView(v.id);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              view === v.id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground" role="status">
          {info}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        {loading ? (
          <p className="p-8 text-center text-sm text-text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">Nothing here.</p>
        ) : (
          <table className="min-w-full text-sm" aria-label="Employee changes">
            <thead className="bg-surface-subtle text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Employee</th>
                <th className="px-4 py-2 text-left font-medium">Change</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Reason</th>
                <th className="px-4 py-2 text-left font-medium">Requested</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 text-text-muted">{r.id}</td>
                  <td className="px-4 py-2 text-text-primary">
                    {r.employee_code} {r.employee_name}
                  </td>
                  <td className="px-4 py-2">{KIND_LABELS[r.kind]}</td>
                  <td className="px-4 py-2">{STATUS_LABELS[r.status]}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-text-secondary" title={r.reason}>
                    {r.reason}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{when(r.requested_at)}</td>
                  <td className="px-4 py-2 text-right">
                    <HrRowActions rowId={r.id} actions={actions(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && (
        <Details
          request={open}
          tier={rights ? decisionTier(open, rights) : null}
          onClose={() => setOpen(null)}
          onDecided={(_r, text) => {
            setOpen(null);
            setInfo(text);
            void load(view);
          }}
        />
      )}
    </div>
  );
}
