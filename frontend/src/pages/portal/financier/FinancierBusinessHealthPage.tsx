import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type SubScore = {
  key: string;
  label: string;
  weight: number;
  value: number;
  raw_metric: number | null;
};

type HealthPayload = {
  score?: number;
  component_weights?: Record<string, number>;
  sub_scores?: SubScore[];
  change_reason?: string | null;
  scope_note?: string | null;
  drill_down_links?: { label: string; path: string }[];
  debt_to_asset_ratio?: number;
  assets_proxy_denominator?: number;
  total_inventory_value?: number;
  cogs_outbound_90d?: number;
};

function scoreRingClass(score: number) {
  if (score > 70) return "text-emerald-600 border-emerald-500";
  if (score >= 40) return "text-amber-600 border-amber-500";
  return "text-red-600 border-red-500";
}

export function FinancierBusinessHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const raw = await financierPortalApi.businessHealth();
        setData(raw as HealthPayload);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const score = typeof data?.score === "number" ? data.score : null;
  const subScores = useMemo(() => (Array.isArray(data?.sub_scores) ? data!.sub_scores! : []), [data]);

  if (err) return <PortalErrorState message={err} />;
  if (!data) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Business health</h1>
        {data.scope_note ? <p className="mt-1 text-sm text-text-muted">{data.scope_note}</p> : null}
      </div>

      <div className="flex flex-col items-center">
        <div
          className={`flex h-40 w-40 flex-col items-center justify-center rounded-full border-4 bg-surface-raised ${score != null ? scoreRingClass(score) : "border-border text-text-muted"}`}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Score</span>
          <span className="text-4xl font-bold tabular-nums">{score != null ? Math.round(score) : "—"}</span>
          <span className="text-xs text-text-muted">/ 100</span>
        </div>
        <p className="mt-3 text-center text-xs text-text-muted">Transparent composite from finance and facility signals (indicative).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/5 p-4">
          <p className="text-xs font-medium uppercase text-text-muted">Debt / asset proxy</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
            {typeof data.debt_to_asset_ratio === "number" ? data.debt_to_asset_ratio.toFixed(4) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            Denominator (AR + cash + inventory FIFO):{" "}
            {typeof data.assets_proxy_denominator === "number" ? data.assets_proxy_denominator.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs font-medium uppercase text-text-muted">Inventory (FIFO)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {typeof data.total_inventory_value === "number" ? data.total_inventory_value.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs font-medium uppercase text-text-muted">Outbound value (90d)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {typeof data.cogs_outbound_90d === "number" ? data.cogs_outbound_90d.toLocaleString() : "—"}
          </p>
          <p className="mt-1 text-[10px] text-text-muted">Used for turnover-style sub-score vs inventory.</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Drivers</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subScores.map((s) => (
            <div key={s.key} className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-sm font-medium text-text-primary">{s.label}</p>
              <p className="mt-1 text-xs text-text-muted">Weight {(Number(s.weight) * 100).toFixed(0)}%</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{Number(s.value).toFixed(1)}</p>
              <p className="mt-1 text-xs text-text-muted">
                Raw: {s.raw_metric == null ? "—" : typeof s.raw_metric === "number" ? s.raw_metric.toFixed(4) : String(s.raw_metric)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {data.change_reason ? (
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <p className="text-xs font-medium uppercase text-text-muted">Why it changed</p>
          <p className="mt-2 text-sm text-text-primary">{data.change_reason}</p>
        </div>
      ) : null}

      {data.drill_down_links && data.drill_down_links.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase text-text-muted">Related (tenant app)</p>
          <ul className="mt-2 flex flex-wrap gap-3 text-sm">
            {data.drill_down_links.map((l) => (
              <li key={l.path}>
                <Link to={l.path} className="text-brand-primary hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
