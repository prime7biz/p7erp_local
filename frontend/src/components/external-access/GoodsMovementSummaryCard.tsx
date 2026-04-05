import { PortalMetricCard } from "./PortalMetricCard";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";

export function GoodsMovementSummaryCard({
  inCount,
  outCount,
  adjust,
  recent,
}: {
  inCount: number;
  outCount: number;
  adjust: number;
  recent: number;
}) {
  return (
    <div className={listPageKpiGridClass}>
      <PortalMetricCard label="Stock IN (rows)" value={inCount} />
      <PortalMetricCard label="Stock OUT (rows)" value={outCount} />
      <PortalMetricCard label="Adjustments" value={adjust} />
      <PortalMetricCard label="Movements (30d)" value={recent} />
    </div>
  );
}
