import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { OrderPromiseSummaryResponse } from "@/api/client";
import { Card } from "@/components/ui/card";

const bdt = new Intl.NumberFormat("en-BD");

export type PromiseStatusesFilter = "NEW,IN_PROGRESS" | "NEW" | "IN_PROGRESS";
export type PromiseRiskTypeFilter = "ALL" | "ATP" | "CTP";

function toStatusLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type PromiseRisksPanelProps = {
  promiseSummary: OrderPromiseSummaryResponse;
  promiseStatusesFilter: PromiseStatusesFilter;
  setPromiseStatusesFilter: (v: PromiseStatusesFilter) => void;
  promiseRiskTypeFilter: PromiseRiskTypeFilter;
  setPromiseRiskTypeFilter: (v: PromiseRiskTypeFilter) => void;
  promiseRefreshing: boolean;
  promiseMinutesAgo: string;
  riskyPromiseOrders: OrderPromiseSummaryResponse["items"];
};

export function PromiseRisksPanel({
  promiseSummary,
  promiseStatusesFilter,
  setPromiseStatusesFilter,
  promiseRiskTypeFilter,
  setPromiseRiskTypeFilter,
  promiseRefreshing,
  promiseMinutesAgo,
  riskyPromiseOrders,
}: PromiseRisksPanelProps) {
  const [showMore, setShowMore] = useState(false);
  const visibleRisks = showMore ? riskyPromiseOrders : riskyPromiseOrders.slice(0, 3);

  return (
    <Card variant="danger" className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Top Promise Risks</h3>
        <Link
          to="/app/orders"
          className="text-[11px] font-semibold text-accent-secondary hover:underline underline-offset-2 flex items-center gap-0.5"
        >
          View orders <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <p className="text-[10px] text-text-muted">Scanned</p>
          <p className="text-sm font-semibold text-text-primary">{bdt.format(promiseSummary.scanned_count)}</p>
        </div>
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2">
          <p className="text-[10px] text-status-danger-foreground/80">Blocked</p>
          <p className="text-sm font-semibold text-status-danger-foreground">
            {bdt.format(promiseSummary.blocked_count)}
          </p>
        </div>
        <div className="rounded-lg border border-status-warning/20 bg-status-warning-subtle px-3 py-2">
          <p className="text-[10px] text-status-warning-foreground/80">ATP fail</p>
          <p className="text-sm font-semibold text-status-warning-foreground">
            {bdt.format(promiseSummary.atp_fail_count)}
          </p>
        </div>
        <div className="rounded-lg border border-brand-primary/20 bg-brand-subtle px-3 py-2">
          <p className="text-[10px] text-brand-primary/80">CTP fail</p>
          <p className="text-sm font-semibold text-brand-primary">{bdt.format(promiseSummary.ctp_fail_count)}</p>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        {promiseRefreshing ? "Updating..." : `Updated ${promiseMinutesAgo}`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
          {(
            [
              { label: "Both", value: "NEW,IN_PROGRESS" as const },
              { label: "NEW", value: "NEW" as const },
              { label: "IN_PROGRESS", value: "IN_PROGRESS" as const },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPromiseStatusesFilter(opt.value)}
              disabled={promiseRefreshing}
              className={`h-9 rounded-md px-2.5 text-[10px] font-semibold transition-colors ${
                promiseStatusesFilter === opt.value
                  ? "bg-status-info-subtle text-status-info-foreground shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
          {(
            [
              {
                label: "All Risks",
                value: "ALL" as const,
                activeClass: "bg-status-danger-subtle text-status-danger-foreground",
              },
              {
                label: "ATP Fail",
                value: "ATP" as const,
                activeClass: "bg-status-warning-subtle text-status-warning-foreground",
              },
              {
                label: "CTP Fail",
                value: "CTP" as const,
                activeClass: "bg-brand-subtle text-brand-primary",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPromiseRiskTypeFilter(opt.value)}
              className={`h-9 rounded-md px-2.5 text-[10px] font-semibold transition-colors ${
                promiseRiskTypeFilter === opt.value
                  ? `${opt.activeClass} shadow-sm`
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {riskyPromiseOrders.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visibleRisks.map((item) => (
            <Link
              key={item.order_id}
              to={`/app/orders/${item.order_id}`}
              className="block rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 hover:bg-status-danger-subtle/80"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-status-danger-foreground">{item.order_code}</p>
                <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                  {toStatusLabel(item.status)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-status-danger-foreground line-clamp-2">
                {item.reasons.length > 0 ? item.reasons.join(" | ") : "ATP/CTP risk detected."}
              </p>
            </Link>
          ))}
          {riskyPromiseOrders.length > 3 && (
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="w-full h-9 rounded-md border border-border text-xs font-medium text-text-secondary hover:bg-state-hover"
            >
              {showMore ? "Show less" : `Show more (${riskyPromiseOrders.length - 3})`}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 h-[120px] flex flex-col items-center justify-center gap-2 text-center p-3">
          <div className="p-3 rounded-full bg-surface-subtle border border-border-subtle">
            <CheckCircle2 className="h-6 w-6 text-status-success-foreground" />
          </div>
          <p className="text-sm font-medium text-text-primary">No matching risks</p>
          <p className="text-xs text-text-muted max-w-[220px]">
            {promiseRiskTypeFilter === "ALL"
              ? "No blocked promise risks in scanned open orders."
              : promiseRiskTypeFilter === "ATP"
                ? "No ATP failures found in scanned open orders."
                : "No CTP failures found in scanned open orders."}
          </p>
        </div>
      )}
    </Card>
  );
}
