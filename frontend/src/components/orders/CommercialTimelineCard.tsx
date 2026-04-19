import { useCallback, useEffect, useState } from "react";
import { api, type CommercialTimelineEventOut } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type EntityType = "order" | "quotation";

function formatActionLabel(action: string): string {
  const map: Record<string, string> = {
    COMMERCIAL_CHANGE_PROPOSED: "Change proposed",
    COMMERCIAL_CHANGE_APPROVED: "Change approved",
    COMMERCIAL_CHANGE_REJECTED: "Change rejected",
    COMMERCIAL_CHANGE_CANCELLED: "Change cancelled",
    COMMERCIAL_CHANGE_APPLIED: "Change applied",
  };
  return map[action] ?? action.replace(/^COMMERCIAL_CHANGE_/, "").replace(/_/g, " ").toLowerCase();
}

function eventSubtitle(ev: CommercialTimelineEventOut): string {
  const d = ev.details;
  const fk = typeof d.field_key === "string" ? d.field_key : null;
  const parts: string[] = [];
  if (fk) parts.push(`Field: ${fk}`);
  if (typeof d.change_request_id === "number") parts.push(`CR #${d.change_request_id}`);
  return parts.join(" · ");
}

type Props = {
  entityType: EntityType;
  entityId: number;
  refreshKey?: number;
};

export function CommercialTimelineCard({ entityType, entityId, refreshKey = 0 }: Props) {
  const [events, setEvents] = useState<CommercialTimelineEventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res =
        entityType === "order"
          ? await api.getOrderCommercialTimeline(entityId, { limit: 200 })
          : await api.getQuotationCommercialTimeline(entityId, { limit: 200 });
      setEvents(res.events ?? []);
    } catch (e) {
      logApiError("CommercialTimelineCard.load", e);
      setErr(e instanceof Error ? e.message : "Failed to load timeline");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Commercial timeline</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Audit trail for commercial change requests (propose, approve, reject, apply) on this{" "}
        {entityType === "order" ? "order" : "quotation"}.
      </p>
      {loading && <div className="text-xs text-text-muted">Loading…</div>}
      {err && <div className="text-xs text-status-danger">{err}</div>}
      {!loading && !err && events.length === 0 && (
        <div className="text-xs text-text-muted">No commercial events yet.</div>
      )}
      {!loading && events.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="rounded-lg border border-border-strong/40 bg-surface-subtle px-2.5 py-2"
            >
              <div className="font-medium text-text-primary">{formatActionLabel(ev.action)}</div>
              <div className="text-text-muted">
                {ev.at ? new Date(ev.at).toLocaleString() : "—"}
                {ev.username ? ` · ${ev.username}` : ev.user_id != null ? ` · user #${ev.user_id}` : ""}
              </div>
              {eventSubtitle(ev) ? (
                <div className="mt-0.5 text-text-secondary">{eventSubtitle(ev)}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
