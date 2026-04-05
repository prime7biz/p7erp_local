import { Badge } from "@/components/ui/badge";

const sevVariant = (s: string) =>
  s === "warning" ? "warning" : s === "danger" ? "danger" : "info";

export function RiskSignalsCard({
  title,
  detail,
  severity,
}: {
  title: string;
  detail: string;
  severity: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">{title}</p>
          <p className="mt-1 text-sm text-text-muted">{detail}</p>
        </div>
        <Badge variant={sevVariant(severity)}>{severity}</Badge>
      </div>
    </div>
  );
}
