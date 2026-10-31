import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, Clock3 } from "lucide-react";
import type { DashboardRecentOrder, DashboardTask } from "@/api/client";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleDonut } from "@/components/dashboard/SimpleDonut";
import { OrderPipelineStrip } from "@/components/dashboard/OrderPipelineStrip";
import type { DashboardQuickAction } from "@/components/dashboard/dashboardRoleVisibility";

type PipelineVizProps = {
  totalOrders: number;
  pipelineStatusCards: { label: string; value: number; status?: string }[];
  orderPieData: { label: string; value: number; color: string }[];
};

function PipelineVisualization({ totalOrders, pipelineStatusCards, orderPieData }: PipelineVizProps) {
  return (
    <Card variant="elevated" className="h-full overflow-hidden">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Order Pipeline</h3>
          <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
            {totalOrders} Total
          </span>
        </div>
        <OrderPipelineStrip statusCards={pipelineStatusCards} className="mb-4" />
        {orderPieData.length > 0 ? (
          <div className="flex items-center gap-4">
            <SimpleDonut segments={orderPieData} total={totalOrders} centerLabel="Orders" />
            <div className="flex-1 space-y-1.5">
              {orderPieData.slice(0, 4).map((entry) => (
                <div key={entry.label} className="flex items-center justify-between text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="truncate text-text-secondary">{entry.label}</span>
                  </div>
                  <span className="font-semibold text-text-primary">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            illustration="orders"
            headline="No orders yet"
            description="Start by creating your first order to see pipeline analytics."
            ctaLabel="Create your first order"
            ctaHref="/app/orders/new"
            className="border-0 bg-transparent py-6"
          />
        )}
      </div>
    </Card>
  );
}

export const MemoizedPipelineViz = memo(PipelineVisualization);

type ActivityTimelineProps = {
  recentOrders: DashboardRecentOrder[];
  tasks: DashboardTask[];
};

function ActivityTimeline({ recentOrders, tasks }: ActivityTimelineProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card variant="default" className="p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-semibold text-text-primary">Recent Orders</h3>
          </div>
          <Link
            to="/app/orders"
            className="flex items-center gap-0.5 text-[11px] font-semibold text-accent-secondary underline-offset-2 hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentOrders.length > 0 ? (
          <ol className="relative space-y-0 border-l border-border pl-4">
            {recentOrders.slice(0, 6).map((order) => (
              <li key={order.id} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.125rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-primary bg-surface-raised" />
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{order.customer_name}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {order.order_code} · {order.style_ref || "N/A"} · Qty {order.quantity ?? 0}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                    {order.status}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            illustration="orders"
            headline="No orders yet"
            description="New confirmed orders will appear here for quick follow-up."
            ctaLabel="Create your first order"
            ctaHref="/app/orders/new"
            className="border-0 bg-transparent"
          />
        )}
      </Card>

      <Card variant="default" className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-status-warning-foreground" />
            <h3 className="text-sm font-semibold text-text-primary">Follow-up Tasks</h3>
          </div>
          <Link
            to="/app/followup"
            className="flex items-center gap-0.5 text-[11px] font-semibold text-accent-secondary underline-offset-2 hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {tasks.length > 0 ? (
          <ol className="relative space-y-0 border-l border-border pl-4">
            {tasks.slice(0, 6).map((task) => (
              <li key={task.id} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.125rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-accent-secondary bg-surface-raised" />
                <p className="truncate text-sm text-text-primary">{task.title}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-text-secondary">Order #{task.order_id}</span>
                  <span className="text-[11px] text-text-secondary">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : "No due date"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            illustration="tasks"
            headline="All caught up!"
            description="TNA and follow-up actions will show here when they need attention."
            ctaLabel="Open follow-up"
            ctaHref="/app/followup"
            className="border-0 bg-transparent"
          />
        )}
      </Card>
    </div>
  );
}

export const MemoizedActivityTimeline = memo(ActivityTimeline);

function QuickActionButton({ action }: { action: DashboardQuickAction }) {
  const Icon = action.icon;
  return (
    <Link to={action.href} aria-label={action.label}>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-text-secondary transition-all hover:border-brand-primary/30 hover:bg-brand-subtle hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{action.label}</span>
      </button>
    </Link>
  );
}

export const MemoizedQuickActionButton = memo(QuickActionButton);

export function MapSkeletonCard({ height = 400 }: { height?: number }) {
  return (
    <div
      className="skeleton-shimmer w-full rounded-xl border border-border"
      style={{ height }}
      aria-hidden
    />
  );
}
