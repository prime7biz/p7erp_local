import { mfgPlanningApi as mp, type RouteStage } from "@/api/mfgPlanning";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";

import { formatDate } from "../formatDecimal";
import { Chip, PanelCard } from "../IntelligenceUi";
import { EmptyState } from "./Phase2Ui";

function StageList({ title, stages }: { title: string; stages: RouteStage[] }) {
  if (stages.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-text-primary">{title}</h4>
      <ul className="mt-1 space-y-1 text-xs">
        {stages.map((s) => (
          <li key={s.action_id} className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface-subtle p-2">
            <span className="font-medium">{s.title ?? s.route_code ?? `Stage #${s.action_id}`}</span>
            <Chip tone={s.is_open ? "info" : "good"}>{s.is_open ? "Open" : "Done"}</Chip>
            <span className="text-text-muted">
              {s.lead_time_days != null ? `${s.lead_time_days} days` : "no lead time set"}
              {s.planned_date ? ` · planned ${formatDate(s.planned_date)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Outside processes (wash, print, embroidery, subcontract) of the order and their lead times. */
export function RouteStagesCard({ orderId }: { orderId: number }) {
  const r = useMfgResource("RouteStagesCard", String(orderId), () => mp.getRouteStages(orderId));
  const d = r.data;
  const none = d && d.pre_sewing.length + d.subcontract_sewing.length + d.post_sewing.length === 0;
  return (
    <PanelCard
      testId="mfg-route-stages"
      title="Outside processes (route)"
      subtitle="Lead-time stages only: there is no subcontractor capacity. Open after-sewing days are added to the delivery estimate."
      loading={r.loading}
      error={r.error}
    >
      {none ? <EmptyState>No outside process stages on this order's follow-up plan.</EmptyState> : null}
      {d && !none ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip tone="info">Before sewing: {d.pre_sewing_open_lead_time_days} open days</Chip>
            <Chip tone="info">After sewing: {d.post_sewing_open_lead_time_days} open days</Chip>
            {d.stages_without_lead_time.length > 0 ? <Chip tone="warn">{d.stages_without_lead_time.length} stage(s) without a lead time</Chip> : null}
          </div>
          <StageList title="Before sewing" stages={d.pre_sewing} />
          <StageList title="Subcontract sewing" stages={d.subcontract_sewing} />
          <StageList title="After sewing" stages={d.post_sewing} />
        </div>
      ) : null}
    </PanelCard>
  );
}
