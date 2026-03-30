import { useCallback, useEffect, useState } from "react";
import { api, type CommercialChangeRequestOut } from "@/api/client";
import type { CommercialFieldDef } from "@/lib/commercialChangeFields";
import { isOrderCommercialLocked, isQuotationCommercialLocked } from "@/lib/commercialChangeFields";
import { logApiError } from "@/utils/logApiError";
import { ProposeChangeModal } from "./ProposeChangeModal";

function fmtVal(raw: string | null): string {
  if (raw == null || raw === "") return "—";
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  } catch {
    return raw;
  }
}

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "pending_approval") return "bg-status-warning-subtle text-status-warning-foreground";
  if (s === "approved") return "bg-status-info-subtle text-status-info-foreground";
  if (s === "applied") return "bg-status-success-subtle text-status-success-foreground";
  if (s === "rejected" || s === "cancelled") return "bg-surface-subtle text-text-muted";
  return "bg-surface-subtle text-text-muted";
}

type Props = {
  entityType: "order" | "quotation";
  entityId: number;
  entityStatus: string;
  fieldDefs: CommercialFieldDef[];
  record: Record<string, unknown>;
};

export function ChangeRequestPanel({ entityType, entityId, entityStatus, fieldDefs, record }: Props) {
  const [rows, setRows] = useState<CommercialChangeRequestOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const locked =
    entityType === "order"
      ? isOrderCommercialLocked(entityStatus)
      : isQuotationCommercialLocked(entityStatus);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data =
        entityType === "order"
          ? await api.listOrderChangeRequests(entityId, { limit: 100 })
          : await api.listQuotationChangeRequests(entityId, { limit: 100 });
      setRows(data);
    } catch (e) {
      logApiError("ChangeRequestPanel.load", e);
      setError(e instanceof Error ? e.message : "Could not load change requests");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setActionMsg("");
    try {
      await fn();
      setActionMsg(`${label} OK`);
      await load();
    } catch (e) {
      logApiError(`ChangeRequestPanel.${label}`, e);
      setActionMsg(e instanceof Error ? e.message : `${label} failed`);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Commercial change requests</h2>
        {locked && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          >
            Propose change
          </button>
        )}
      </div>
      <p className="text-xs text-text-muted">
        {locked
          ? "Sensitive commercial fields on this record require an approved change request before they update."
          : "This record is editable directly; change requests are not required."}
      </p>
      {loading && <div className="text-xs text-text-muted">Loading…</div>}
      {error && <div className="text-xs text-status-danger-foreground">{error}</div>}
      {actionMsg && <div className="text-xs text-status-info-foreground">{actionMsg}</div>}

      {!loading && rows.length === 0 && (
        <div className="text-xs text-text-muted">No change requests yet.</div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{r.field_key}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(r.status)}`}>
                  {r.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="text-text-secondary">
                <span className="text-text-muted">From</span> {fmtVal(r.old_value)}{" "}
                <span className="text-text-muted">→</span> {fmtVal(r.new_value)}
              </div>
              <div className="text-text-muted">{r.reason}</div>
              <div className="flex flex-wrap gap-1 pt-1">
                {r.status === "pending_approval" && (
                  <>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-surface-subtle"
                      onClick={() => void run("approve", () => api.approveCommercialChangeRequest(r.id))}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-status-danger/30 px-2 py-0.5 text-[11px] text-status-danger hover:bg-status-danger-subtle"
                      onClick={() => void run("reject", () => api.rejectCommercialChangeRequest(r.id, "Rejected"))}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-surface-subtle"
                      onClick={() => void run("cancel", () => api.cancelCommercialChangeRequest(r.id))}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {r.status === "approved" && (
                  <button
                    type="button"
                    className="rounded-md border border-brand-primary/40 px-2 py-0.5 text-[11px] text-brand-primary hover:bg-brand-primary/10"
                    onClick={() => void run("apply", () => api.applyCommercialChangeRequest(r.id))}
                  >
                    Apply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ProposeChangeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entityType={entityType}
        entityId={entityId}
        fieldDefs={fieldDefs}
        record={record}
        onCreated={() => void load()}
      />
    </div>
  );
}
