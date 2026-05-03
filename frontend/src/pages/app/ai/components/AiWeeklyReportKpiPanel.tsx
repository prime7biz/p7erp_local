import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AiWeeklyReportDeltaEntry, AiWeeklyReportItem } from "@/api/client";
import { kpiKeyLabel } from "@/pages/app/ai/utils/weeklyReportFormat";

const KNOWN_ORDER = [
  "active_orders",
  "total_customers",
  "pending_approvals_total",
  "orders_past_delivery_open",
  "open_downtime_events",
  "open_trade_cases",
];

function DeltaChip({ d }: { d: AiWeeklyReportDeltaEntry }) {
  if (d.change == null) return <span className="text-text-muted">—</span>;
  const up = d.change > 0;
  const down = d.change < 0;
  return (
    <span
      className={
        up
          ? "text-status-error-foreground"
          : down
            ? "text-status-success-foreground"
            : "text-text-muted"
      }
    >
      {up ? "+" : ""}
      {d.change}
    </span>
  );
}

export function AiWeeklyReportKpiPanel({ report }: { report: AiWeeklyReportItem }) {
  const [open, setOpen] = useState(false);
  const snap = report.kpi_snapshot_json;
  if (!snap || typeof snap !== "object") {
    return null;
  }
  const rawKeys = [...KNOWN_ORDER, ...Object.keys(snap as object).filter((k) => !KNOWN_ORDER.includes(k))].filter(
    (k) => k !== "week_label" && k !== "as_of",
  );
  const seen = new Set<string>();
  const keys = rawKeys.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const asOf = (snap as Record<string, unknown>).as_of;
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-subtle/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-text-secondary"
      >
        <span>Numbers behind this report</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-0">
          {asOf != null && (
            <p className="pt-2 text-xs text-text-muted">
              As of: {String(asOf)} · {String((snap as Record<string, unknown>).week_label ?? "")}
            </p>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {keys.map((k) => {
              const v = (snap as Record<string, unknown>)[k];
              if (v === null || v === undefined) return null;
              if (typeof v === "object") return null;
              const delta = report.delta?.[k];
              return (
                <div key={k} className="rounded border border-border/80 bg-surface-raised px-2.5 py-1.5 text-xs">
                  <div className="text-text-muted">{kpiKeyLabel(k)}</div>
                  <div className="mt-0.5 font-mono text-text-primary">{String(v)}</div>
                  {delta && <div className="mt-0.5 text-text-muted">vs prior week: <DeltaChip d={delta} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
