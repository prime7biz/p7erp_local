import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { PortalMetricCard } from "@/components/external-access/PortalMetricCard";
import { FinancierConfidenceSummaryCard } from "@/components/external-access/FinancierConfidenceSummaryCard";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { GoodsMovementSummaryCard } from "@/components/external-access/GoodsMovementSummaryCard";

export function FinancierDashboardPage() {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.dashboard();
        if (ok) setD(x);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;
  if (!d) return <p className="text-sm text-text-muted">Loading…</p>;

  const pipeline = d.pipeline as Record<string, number> | undefined;
  const goods = d.goods as Record<string, number> | undefined;

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
      <FinancierConfidenceSummaryCard>
        <p>
          Operational and commercial signals below are aggregated for transparency. No line-level costing or supplier
          pricing is exposed.
        </p>
      </FinancierConfidenceSummaryCard>
      <div className={listPageKpiGridClass}>
        <PortalMetricCard label="Order lines (all)" value={Number(d.active_order_lines ?? 0)} />
        <PortalMetricCard label="Confirmed orders" value={Number(d.confirmed_style_orders ?? 0)} />
        <PortalMetricCard label="Shipments due (month)" value={Number(d.shipments_due_this_month ?? 0)} />
        <PortalMetricCard label="Open alerts" value={Number(d.alerts_count ?? 0)} />
        <PortalMetricCard
          label="Projection (3 mo units)"
          value={typeof d.projection_next_90_units === "number" ? d.projection_next_90_units : "—"}
        />
      </div>
      {pipeline ? (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-text-primary mb-2">Pipeline</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-text-muted sm:grid-cols-4">
            <span>Inquiries open: {pipeline.inquiries_open}</span>
            <span>Inquiries submitted: {pipeline.inquiries_submitted}</span>
            <span>Quotations open: {pipeline.quotations_open}</span>
            <span>Quotations sent: {pipeline.quotations_sent}</span>
          </div>
        </div>
      ) : null}
      {goods ? (
        <GoodsMovementSummaryCard
          inCount={Number(goods.movements_in_count ?? 0)}
          outCount={Number(goods.movements_out_count ?? 0)}
          adjust={Number(goods.movements_adjust_count ?? 0)}
          recent={Number(goods.last_30_days_total ?? 0)}
        />
      ) : null}
    </div>
  );
}
