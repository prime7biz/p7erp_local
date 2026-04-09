import { useCallback, useEffect, useState } from "react";
import { api, type OrderMilestonesResponse } from "@/api/client";
import { PIPELINE_STAGES, humanizePipelineStatus } from "@/features/merch/workflow";
import { logApiError } from "@/utils/logApiError";

type Variant = "full" | "compact";

const stepClass = (st: string) => {
  if (st === "done") return "bg-status-success";
  if (st === "current") return "bg-status-info animate-pulse";
  if (st === "na") return "bg-surface-subtle opacity-60";
  return "bg-surface-subtle";
};

export function OrderPipelineListCell({
  pipelineStatus,
  rmPct,
}: {
  pipelineStatus?: string | null;
  rmPct?: number | null;
}) {
  const cur = (pipelineStatus || "ORDER_CONFIRMED").toUpperCase();
  let idx = PIPELINE_STAGES.indexOf(cur as (typeof PIPELINE_STAGES)[number]);
  if (idx < 0) idx = 2;
  const title = `${humanizePipelineStatus(cur)}${rmPct != null ? ` · RM ${Number(rmPct).toFixed(1)}%` : ""}`;
  return (
    <div className="w-[200px]" title={title}>
      <div className="flex h-2 overflow-hidden rounded bg-surface-subtle">
        {PIPELINE_STAGES.map((_, i) => (
          <div
            key={i}
            className={`flex-1 border-r border-surface-raised last:border-0 ${
              i < idx ? "bg-status-success" : i === idx ? "bg-status-info" : "bg-surface-subtle"
            }`}
          />
        ))}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-text-muted">{cur.replace(/_/g, " ")}</div>
    </div>
  );
}

type TrackerProps = {
  orderId: number;
  variant: Variant;
  className?: string;
  onLoaded?: (data: OrderMilestonesResponse) => void;
};

export function OrderMilestoneTracker({ orderId, variant, className = "", onLoaded }: TrackerProps) {
  const [data, setData] = useState<OrderMilestonesResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const m = await api.getOrderMilestones(orderId);
      setData(m);
      onLoaded?.(m);
    } catch (e) {
      logApiError("OrderMilestoneTracker.getOrderMilestones", e);
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    }
  }, [orderId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <div className={`text-xs text-status-danger ${className}`}>{error}</div>;
  }
  if (!data) {
    return <div className={`text-xs text-text-muted ${className}`}>Loading pipeline…</div>;
  }

  if (variant === "compact") {
    const cur = (data.pipeline_status || "ORDER_CONFIRMED").toUpperCase();
    let idx = PIPELINE_STAGES.indexOf(cur as (typeof PIPELINE_STAGES)[number]);
    if (idx < 0) idx = 2;
    const warnTitle =
      data.tna_warnings?.length > 0 ? `TNA: ${data.tna_warnings.join("; ")}` : undefined;
    return (
      <div className={className} title={warnTitle}>
        <div className="flex h-2 overflow-hidden rounded bg-surface-subtle">
          {data.steps.map((s, i) => (
            <div
              key={`${s.name}-${i}`}
              className={`flex-1 border-r border-surface-raised last:border-0 ${stepClass(s.status)}`}
            />
          ))}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-text-muted">
          <span>{humanizePipelineStatus(cur)}</span>
          {data.rm_inhouse_pct != null && (
            <span className="rounded bg-surface-subtle px-1">RM {data.rm_inhouse_pct.toFixed(1)}%</span>
          )}
          {data.tna_warnings?.length > 0 && (
            <span className="rounded bg-status-warning-subtle px-1 text-status-warning-foreground">
              {data.tna_warnings.length} TNA
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <span className="font-semibold text-text-primary">Order pipeline</span>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5">
          {humanizePipelineStatus(data.pipeline_status)}
        </span>
        {data.rm_inhouse_pct != null && (
          <span className="rounded-full bg-surface-subtle px-2 py-0.5">
            RM in-house {data.rm_inhouse_pct.toFixed(1)}%
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border-strong px-2 py-0.5 text-[10px] hover:bg-surface-subtle"
        >
          Refresh
        </button>
      </div>
      {data.tna_warnings?.length > 0 && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground">
          <span className="font-medium">TNA (soft gates): </span>
          {data.tna_warnings.join(" · ")}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {data.steps.map((s) => (
          <div
            key={s.name}
            className="flex min-w-[72px] flex-1 flex-col items-center rounded-lg border border-border bg-surface-raised p-2 text-center"
            title={s.timestamp || undefined}
          >
            <div
              className={`mb-1 h-8 w-8 rounded-full border-2 ${
                s.status === "done"
                  ? "border-status-success bg-status-success-subtle"
                  : s.status === "current"
                    ? "border-status-info bg-status-info-subtle"
                    : s.status === "na"
                      ? "border-dashed border-border bg-surface-subtle"
                      : "border-border bg-surface-subtle"
              }`}
            />
            <div className="text-[10px] font-medium leading-tight text-text-primary">
              {humanizePipelineStatus(s.name)}
            </div>
            <div className="text-[9px] uppercase text-text-muted">{s.status}</div>
            {s.name === "RM_RECEIVED" && s.rm_pct != null && (
              <div className="text-[9px] text-text-secondary">{s.rm_pct.toFixed(1)}%</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
