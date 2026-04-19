import { Link } from "react-router-dom";
import type { MerchAlertItem } from "@/api/client";
import { merchAlertPrimaryHref } from "@/utils/merchAlertLinks";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-status-danger-subtle", text: "text-status-danger-foreground", label: "Critical" },
  high: { bg: "bg-status-warning-subtle", text: "text-status-warning-foreground", label: "High" },
  medium: { bg: "bg-status-info-subtle", text: "text-status-info-foreground", label: "Medium" },
  low: { bg: "bg-brand-primary/10", text: "text-brand-primary", label: "Low" },
  informational: { bg: "bg-status-neutral-subtle", text: "text-status-neutral-foreground", label: "Info" },
};
const DEFAULT_SEVERITY_STYLE = { bg: "bg-status-info-subtle", text: "text-status-info-foreground", label: "Medium" };

interface MerchAlertCardProps {
  alert: MerchAlertItem;
  selected: boolean;
  onToggleSelected: (id: number) => void;
  onOpen: (id: number) => void;
}

export function MerchAlertCard({ alert, selected, onToggleSelected, onOpen }: MerchAlertCardProps) {
  const severity = SEVERITY_STYLES[alert.severity] ?? DEFAULT_SEVERITY_STYLE;
  const primaryHref = merchAlertPrimaryHref(alert);
  return (
    <div
      className={`rounded-lg border-l-4 ${severity.bg} border ${selected ? "ring-2 ring-focus-ring/60 border-brand-primary/40" : "border-border"} bg-surface-raised p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${alert.severity === "critical" ? "border-l-status-danger" : alert.severity === "high" ? "border-l-status-warning" : ""}`}
      onClick={() => onOpen(alert.id)}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelected(alert.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 rounded"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${severity.bg} ${severity.text}`}>
              {severity.label}
            </span>
            <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-neutral-subtle text-status-neutral-foreground capitalize">
              {alert.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1.5 font-medium text-text-primary line-clamp-2">{alert.title}</p>
          <p className="text-xs text-text-muted mt-0.5">{alert.alert_type.replace(/_/g, " ")}</p>
          {alert.order_code ? (
            <Link
              to={`/app/orders/${alert.order_id!}`}
              className="text-xs text-brand-primary hover:underline mt-1 inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              {alert.order_code}
            </Link>
          ) : primaryHref ? (
            <Link
              to={primaryHref}
              className="text-xs text-brand-primary hover:underline mt-1 inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              Open related record
            </Link>
          ) : null}
          <p className="text-xs text-text-muted mt-1">{alert.created_at ? new Date(alert.created_at).toLocaleDateString() : ""}</p>
        </div>
      </div>
    </div>
  );
}
