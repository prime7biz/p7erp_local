import { listPageKpiCardClass, listPageKpiLabelClass } from "@/components/app/listPageLayout";

export function PortalMetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={listPageKpiCardClass}>
      <div className={listPageKpiLabelClass}>{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
    </div>
  );
}
