import { useCallback, useEffect, useState } from "react";
import { api, type PlanningGroundingSnapshot } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function readinessPillClass(overall: string): string {
  const o = (overall || "").toLowerCase();
  if (o === "ready") return "bg-status-success-subtle text-status-success-foreground";
  if (o === "at_risk") return "bg-status-warning-subtle text-status-warning-foreground";
  if (o === "blocked") return "bg-status-danger-subtle text-status-danger-foreground";
  return "bg-surface-subtle text-text-muted";
}

function signalPillClass(st: string): string {
  const s = (st || "").toLowerCase();
  if (s === "ok") return "bg-status-success-subtle text-status-success-foreground";
  if (s === "warning") return "bg-status-warning-subtle text-status-warning-foreground";
  if (s === "blocked") return "bg-status-danger-subtle text-status-danger-foreground";
  return "bg-surface-subtle text-text-muted";
}

type Props = {
  orderId: number;
};

export function PlanningGroundingCard({ orderId }: Props) {
  const [data, setData] = useState<PlanningGroundingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMeta, setOpenMeta] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await api.getOrderPlanningGrounding(orderId);
      setData(snap);
    } catch (e) {
      logApiError("PlanningGroundingCard.load", e);
      setError(e instanceof Error ? e.message : "Could not load planning grounding");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Planning data grounding</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Deterministic signals from ATP/CTP, production readiness chain, line-board overlap heuristics, and dependency
        checks. Advisory only — does not change orders or production plans.
      </p>
      {loading && <div className="text-xs text-text-muted">Loading…</div>}
      {error && <div className="text-xs text-status-danger-foreground">{error}</div>}
      {data && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Overall</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${readinessPillClass(data.overall_readiness)}`}>
              {data.overall_readiness.replace(/_/g, " ")}
            </span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.signals.map((s) => (
              <div key={s.code} className="rounded-lg border border-border-subtle p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{s.code.replace(/_/g, " ")}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${signalPillClass(s.status)}`}>
                    {s.status}
                  </span>
                  <span className="text-text-muted">conf: {s.confidence}</span>
                  <span className="text-text-muted truncate" title={s.source}>
                    {s.source}
                  </span>
                </div>
                {s.explanation && <p className="mt-1 text-text-secondary">{s.explanation}</p>}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpenMeta((v) => !v)}
            className="text-xs text-status-info hover:underline"
          >
            {openMeta ? "Hide" : "Show"} assumptions & limitations
          </button>
          {openMeta && (
            <div className="rounded-lg bg-surface-subtle p-2 text-xs text-text-secondary space-y-2">
              {data.assumptions.length > 0 && (
                <div>
                  <div className="font-semibold text-text-primary">Assumptions</div>
                  <ul className="list-disc pl-4 mt-1">
                    {data.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="font-semibold text-text-primary">Limitations</div>
                <ul className="list-disc pl-4 mt-1">
                  {data.limitations.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
