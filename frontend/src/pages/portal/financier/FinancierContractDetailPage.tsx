import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { ContractScoreDials } from "./contract-command/ContractScoreDials";
import { ContractTimelineRibbon } from "./contract-command/ContractTimelineRibbon";
import { CashLadderChart } from "./contract-command/CashLadderChart";
import { WhatIfPanel } from "./contract-command/WhatIfPanel";
import { logApiError } from "@/utils/logApiError";

type Tab = "overview" | "orders" | "cash" | "narrative";

export function FinancierContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const id = Number(contractId);
  const [tab, setTab] = useState<Tab>("overview");
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [narrative, setNarrative] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    setErr("");
    try {
      const detail = await financierPortalApi.contractDetail(id);
      setD(detail);
      const nar = await financierPortalApi.contractNarrative(id).catch((e) => {
        logApiError("contract narrative", e);
        return null;
      });
      setNarrative(nar);
    } catch (e) {
      logApiError("contract detail", e);
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!Number.isFinite(id)) return <PortalErrorState message="Invalid contract" />;
  if (err) return <PortalErrorState message={err} onRetry={() => void load()} />;
  if (loading || !d) return <p className="text-sm text-text-muted">Loading…</p>;

  const mc = d.master_contract as Record<string, unknown> | undefined;
  const risk = d.risk as Record<string, unknown> | undefined;
  const cash = d.cash_ladder as Record<string, unknown> | undefined;
  const timeline = (d.timeline as { id: string; status: string }[]) ?? [];
  const ordersRisk = (d.orders_risk as Record<string, unknown>[]) ?? [];

  const comps = risk?.components as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/portal/financier/contracts" className="text-xs font-medium text-brand-primary hover:underline">
            ← Contracts
          </Link>
          <h1 className="mt-1 text-xl font-bold text-text-primary">{String(mc?.reference ?? "Contract")}</h1>
          <p className="text-sm text-text-muted">
            {String(mc?.buyer_name ?? "—")} · {String(mc?.status ?? "")} · {String(mc?.currency ?? "")}{" "}
            {mc?.amount != null ? String(mc.amount) : ""}
          </p>
        </div>
        <p className="text-sm font-semibold text-text-primary">
          Composite: <span className="text-brand-primary">{String(risk?.composite_score ?? "—")}</span>
        </p>
      </div>

      <ContractTimelineRibbon nodes={timeline} />

      <ContractScoreDials
        otd={comps?.otd_avg as number | undefined}
        maturity={comps?.maturity_safety as number | undefined}
        cash={comps?.cashability as number | undefined}
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["overview", "Overview"],
            ["orders", "Orders & risk"],
            ["cash", "Cash ladder"],
            ["narrative", "AI brief"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === k ? "bg-brand-primary/10 text-brand-primary" : "text-text-muted hover:bg-surface-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <WhatIfPanel contractId={id} />
          <div className="rounded-2xl border border-border bg-surface-raised p-4">
            <h3 className="text-sm font-semibold text-text-primary">Maturity (rollup)</h3>
            <pre className="mt-2 max-h-48 overflow-auto text-[11px] text-text-muted">
              {JSON.stringify(d.maturity ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">OTD score</th>
                <th className="px-3 py-2">Delay (d)</th>
                <th className="px-3 py-2">RM %</th>
              </tr>
            </thead>
            <tbody>
              {ordersRisk.map((r) => (
                <tr key={String(r.order_id)} className="border-t border-border">
                  <td className="px-3 py-2">{String(r.order_code)}</td>
                  <td className="px-3 py-2 tabular-nums">{String(r.otd_score)}</td>
                  <td className="px-3 py-2 tabular-nums">{String(r.predicted_delay_days)}</td>
                  <td className="px-3 py-2 tabular-nums">{String(r.rm_received_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "cash" ? (
        <div className="rounded-2xl border border-border bg-surface-raised p-4">
          <h3 className="text-sm font-semibold text-text-primary">Planned CM (8 weeks)</h3>
          <p className="text-xs text-text-muted">
            Total planned CM: {String(cash?.total_planned_cm_order_book ?? "—")} {String(cash?.currency ?? "")} · Actual CM
            vouchers: {String(cash?.actual_cm_vouchers_debit ?? "—")}
          </p>
          <div className="mt-4">
            <CashLadderChart
              weeks={
                (cash?.weeks as {
                  week_start: string;
                  planned_cm_outflow: number;
                  running_balance_proxy: number;
                }[]) ?? []
              }
            />
          </div>
        </div>
      ) : null}

      {tab === "narrative" ? (
        <div className="rounded-2xl border border-violet-200/60 bg-violet-500/5 p-4 dark:border-violet-900/40">
          <h3 className="text-sm font-semibold text-text-primary">Bank briefing (read-only)</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
            {String(narrative?.narrative ?? "Enable AI narrative in server settings or open Overview.")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
