import { Badge } from "@/components/ui/badge";

export function ProjectedSalesCard({ month, units }: { month: string; units: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-sm font-medium text-text-primary">{month}</span>
      <Badge variant="accent">{units} units</Badge>
    </div>
  );
}
