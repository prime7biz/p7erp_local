import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { MerchAlertsSummaryResponse, UnifiedTnaSummaryResponse } from "@/api/client";

const bdt = new Intl.NumberFormat("en-BD");

type MerchHealthBlockProps = {
  unifiedTnaSummary: UnifiedTnaSummaryResponse;
  merchAlertsSummary: MerchAlertsSummaryResponse;
  promiseBlockedCount: number;
  commercialPendingCount: number | null;
  /** When false, skip the commercial pending banner. Default true. */
  showCommercialBanner?: boolean;
};

export function MerchHealthBlock({
  unifiedTnaSummary,
  merchAlertsSummary,
  promiseBlockedCount,
  commercialPendingCount,
  showCommercialBanner = true,
}: MerchHealthBlockProps) {
  const merchWorkflowStats = [
    {
      label: "Unified TNA Open",
      value: unifiedTnaSummary.open_count,
      href: "/app/followup",
      tone: "text-status-info-foreground",
      bg: "bg-status-info-subtle border-status-info/20",
    },
    {
      label: "Unified TNA Overdue",
      value: unifiedTnaSummary.overdue_count,
      href: "/app/followup",
      tone: unifiedTnaSummary.overdue_count > 0 ? "text-status-warning-foreground" : "text-text-primary",
      bg:
        unifiedTnaSummary.overdue_count > 0
          ? "bg-status-warning-subtle border-status-warning/20"
          : "bg-surface-subtle border-border",
    },
    {
      label: "Critical Alerts",
      value: merchAlertsSummary.by_severity.critical,
      href: "/app/merchandising/alerts",
      tone: merchAlertsSummary.by_severity.critical > 0 ? "text-status-danger-foreground" : "text-text-primary",
      bg:
        merchAlertsSummary.by_severity.critical > 0
          ? "bg-status-danger-subtle border-status-danger/20"
          : "bg-surface-subtle border-border",
    },
    {
      label: "Total Alerts",
      value: merchAlertsSummary.total,
      href: "/app/merchandising/alerts",
      tone: "text-text-primary",
      bg: "bg-surface-subtle border-border",
    },
    {
      label: "Promise Risks",
      value: promiseBlockedCount,
      href: "/app/orders",
      tone: promiseBlockedCount > 0 ? "text-status-danger-foreground" : "text-text-primary",
      bg:
        promiseBlockedCount > 0
          ? "bg-status-danger-subtle border-status-danger/20"
          : "bg-surface-subtle border-border",
    },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
        Merch Workflow Health
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {merchWorkflowStats.map((stat) => (
          <Link
            key={stat.label}
            to={stat.href}
            className={`rounded-xl border p-4 shadow-sm transition-colors hover:bg-surface-raised ${stat.bg}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-text-secondary">{stat.label}</p>
              <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
            </div>
            <p className={`mt-2 text-2xl font-bold ${stat.tone}`}>{bdt.format(stat.value)}</p>
          </Link>
        ))}
      </div>

      {showCommercialBanner && (
        <div className="mt-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Pending commercial change approvals</h3>
            <Link
              to="/app/orders"
              className="text-[11px] font-semibold text-brand-primary hover:text-brand-primary/90 hover:underline underline-offset-2 flex items-center gap-0.5"
            >
              Open orders <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-1 text-2xl font-bold text-text-primary">
            {commercialPendingCount == null ? "—" : commercialPendingCount}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Locked orders/quotations need an approved request before sensitive commercial fields change.
          </p>
        </div>
      )}
    </section>
  );
}
