import { useCallback, useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { logApiError } from "@/utils/logApiError";

export function WhatIfPanel({ contractId }: { contractId: number }) {
  const [etd, setEtd] = useState(0);
  const [rm, setRm] = useState(0);
  const [server, setServer] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const r = await financierPortalApi.contractWhatIf(contractId, { etd_shift_days: etd, rm_accel_pct: rm });
      setServer(r);
    } catch (e) {
      logApiError("contract what-if", e);
      setServer(null);
    } finally {
      setLoading(false);
    }
  }, [contractId, etd, rm]);

  useEffect(() => {
    const t = window.setTimeout(() => void run(), 400);
    return () => window.clearTimeout(t);
  }, [run]);

  const adj = server?.adjusted_risk as Record<string, unknown> | undefined;
  const comp = adj?.composite_score;

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <h3 className="text-sm font-semibold text-text-primary">What-if (server)</h3>
      <p className="mt-1 text-xs text-text-muted">Adjust sliders; scores recompute on the server (not saved).</p>
      <div className="mt-4 space-y-3">
        <label className="block text-xs text-text-muted">
          ETD slack (days): {etd}
          <input
            type="range"
            min={-14}
            max={21}
            value={etd}
            onChange={(e) => setEtd(Number(e.target.value))}
            className="mt-1 block w-full"
          />
        </label>
        <label className="block text-xs text-text-muted">
          RM acceleration (%): {rm}
          <input
            type="range"
            min={0}
            max={100}
            value={rm}
            onChange={(e) => setRm(Number(e.target.value))}
            className="mt-1 block w-full"
          />
        </label>
      </div>
      {loading ? <p className="mt-3 text-xs text-text-muted">…</p> : null}
      {comp != null ? (
        <p className="mt-3 text-sm font-semibold text-text-primary">
          Adjusted composite: <span className="text-brand-primary">{String(comp)}</span>
        </p>
      ) : null}
    </div>
  );
}
