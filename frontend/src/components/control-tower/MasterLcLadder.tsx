import { Link } from "react-router-dom";

import type { ControlTowerLcSnapshotResponse } from "@/api/client";

export function MasterLcLadder({
  options,
  selectedId,
  onSelect,
  snapshot,
  loading,
  error,
}: {
  options: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  snapshot: ControlTowerLcSnapshotResponse | null;
  loading: boolean;
  error: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Master LC ladder</h3>
        <Link
          to="/app/commercial/master-contracts"
          className="text-xs text-status-info hover:underline"
        >
          Open master contracts
        </Link>
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-text-muted">No master contracts linked to orders in this window.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-text-secondary">Master LC</label>
          <select
            className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs"
            value={selectedId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onSelect(v === "" ? null : Number(v));
            }}
          >
            <option value="">Select…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {error ? <div className="text-xs text-status-danger-foreground">{error}</div> : null}
      {loading ? <p className="text-xs text-text-muted">Loading snapshot…</p> : null}
      {snapshot && !loading ? (
        <div className="rounded border border-border-subtle bg-surface-subtle p-3 text-xs space-y-1">
          <div>
            <span className="font-medium text-text-primary">{snapshot.reference}</span>{" "}
            <span className="text-text-muted">· {snapshot.status}</span>
          </div>
          <div className="text-text-secondary">
            Amount: {snapshot.amount ?? "—"} {snapshot.currency ?? ""}
          </div>
          <div className="text-text-secondary">BTB LCs: {snapshot.btb_lc_count}</div>
          <div className="text-text-secondary">
            Linked orders: {snapshot.linked_order_ids.length ? snapshot.linked_order_ids.join(", ") : "—"}
          </div>
          <div className="pt-2">
            <Link
              to="/app/commercial/btb-lcs"
              className="text-status-info hover:underline"
            >
              View BTB LCs
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
