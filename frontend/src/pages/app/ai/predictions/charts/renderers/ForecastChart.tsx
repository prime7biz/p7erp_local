import type { AiForecastRunResponse } from "@/api/client";
import { MiniBars } from "@/pages/app/ai/predictions/charts/MiniBars";
import { Sparkline } from "@/pages/app/ai/predictions/charts/Sparkline";
import {
  getAgingBuckets,
  getCapacityPoint,
  getHistoryNetCash,
  getInventoryShortageItems,
  getProductionHistoryAndProjected,
  getProjectedNetCash,
  getShipmentPoint,
  runResultJson,
} from "@/pages/app/ai/predictions/utils/forecastGuards";

function RiskGauge({ level }: { level: string }) {
  const steps = ["LOW", "MEDIUM", "HIGH"];
  const idx = steps.indexOf(String(level).toUpperCase());
  return (
    <div className="flex gap-2">
      {steps.map((s, i) => (
        <span
          key={s}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            i === idx ? "bg-status-warning-subtle text-status-warning-foreground" : "bg-surface-subtle text-text-muted"
          }`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export function ForecastChart({ run }: { run: AiForecastRunResponse }) {
  const rj = runResultJson(run);
  const code = run.forecast_code;

  if (code === "cash_flow_projection") {
    const hist = getHistoryNetCash(rj).map((x) => x.value);
    const proj = getProjectedNetCash(rj).map((x) => x.value);
    const combined = [...hist, ...proj];
    if (combined.length === 0) return <p className="text-[11px] text-text-muted">No series data.</p>;
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-text-muted">Net cash (history + projected)</p>
        <Sparkline values={combined} />
      </div>
    );
  }

  if (code === "inventory_shortage_forecast") {
    const items = getInventoryShortageItems(rj);
    const rows = items.map((it) => ({
      label: `Item ${it.item_id ?? "?"}`,
      value: Number(it.days_to_stockout) || 0,
    }));
    return <MiniBars rows={rows} valueFormat={(n) => `${n.toFixed(1)} d`} />;
  }

  if (code === "production_output_forecast") {
    const { historyVals, projected } = getProductionHistoryAndProjected(rj);
    const combined = [...historyVals, ...projected];
    if (!combined.length) return <p className="text-[11px] text-text-muted">No output data.</p>;
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-text-muted">Monthly output + projected</p>
        <Sparkline values={combined} />
      </div>
    );
  }

  if (code === "shipment_delay_risk_projection") {
    const p = getShipmentPoint(rj);
    if (!p) return null;
    return (
      <div className="space-y-2">
        <RiskGauge level={p.risk_level ?? "LOW"} />
        <p className="text-[11px] text-text-secondary">
          Due next: {p.due_next_orders ?? 0} · Projected delayed: {p.projected_delayed_orders ?? 0}
        </p>
      </div>
    );
  }

  if (code === "receivable_risk_outlook") {
    const b = getAgingBuckets(rj);
    if (!b) return null;
    const rows = Object.entries(b).map(([k, v]) => ({
      label: k.replaceAll("_", " "),
      value: typeof v === "number" ? v : 0,
    }));
    return <MiniBars rows={rows} valueFormat={(n) => n.toFixed(0)} />;
  }

  if (code === "capacity_shortfall_projection") {
    const p = getCapacityPoint(rj);
    if (!p) return null;
    return (
      <MiniBars
        rows={[
          { label: "Backlog", value: p.backlog_qty ?? 0 },
          { label: "Projected capacity", value: p.projected_capacity_qty ?? 0 },
          { label: "Shortfall", value: p.projected_shortfall_qty ?? 0 },
        ]}
      />
    );
  }

  return <p className="text-[11px] text-text-muted">No chart for this forecast type.</p>;
}
