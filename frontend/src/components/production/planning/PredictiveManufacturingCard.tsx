import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";

import { api, type PredictiveHeuristicResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

/** Small Phase 4 MVP card: heuristic defect-risk + line-balance suggestions. */
export function PredictiveManufacturingCard() {
  const [defect, setDefect] = useState<PredictiveHeuristicResponse | null>(null);
  const [balance, setBalance] = useState<PredictiveHeuristicResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.getPredictiveDefectRisk(14), api.getPredictiveLineBalance(7)])
      .then(([d, b]) => {
        setDefect(d);
        setBalance(b);
      })
      .catch((e) => logApiError("PredictiveManufacturingCard", e))
      .finally(() => setLoading(false));
  }, []);

  const topDefect = defect?.items?.[0];
  const topBalance = balance?.items?.find((i) => i.action && i.action !== "hold") ?? balance?.items?.[0];

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Predictive manufacturing (heuristic)</h3>
          <p className="text-[11px] text-text-muted">
            Defect risk &amp; line balance from recent QC / hourly data · source: heuristic
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {!defect && !balance ? (
        <p className="text-xs text-text-muted">Click Refresh for advisory scores (not ML — placeholder heuristics when data is thin).</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <p className="font-medium text-text-primary">Defect risk</p>
            {topDefect ? (
              <>
                <p className="mt-1 text-text-secondary">
                  {String(topDefect.line_name ?? "All lines")} · score{" "}
                  {String(topDefect.risk_score ?? "—")} ({String(topDefect.severity ?? "")})
                </p>
                <p className="mt-1 text-text-muted">{String(topDefect.suggestion ?? "")}</p>
              </>
            ) : (
              <p className="mt-1 text-text-muted">No items</p>
            )}
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <p className="font-medium text-text-primary">Line balance</p>
            {topBalance ? (
              <>
                <p className="mt-1 text-text-secondary">
                  {String(topBalance.line_name ?? "—")} · eff{" "}
                  {String(topBalance.efficiency_score ?? "—")} · {String(topBalance.action ?? "")}
                </p>
                <p className="mt-1 text-text-muted">{String(topBalance.suggestion ?? "")}</p>
              </>
            ) : (
              <p className="mt-1 text-text-muted">No items</p>
            )}
          </div>
        </div>
      )}
      {(defect?.limitations?.[0] || balance?.limitations?.[0]) && (
        <p className="mt-2 text-[10px] text-text-muted">
          {defect?.limitations?.[0] || balance?.limitations?.[0]}
        </p>
      )}
    </div>
  );
}
