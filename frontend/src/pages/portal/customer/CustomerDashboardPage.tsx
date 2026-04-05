import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerPortalApi } from "@/hooks/useCustomerPortal";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { PortalMetricCard } from "@/components/external-access/PortalMetricCard";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { PortalEmptyState } from "@/components/external-access/PortalEmptyState";
import { Badge } from "@/components/ui/badge";

type Dash = {
  active_orders: number;
  pending_approval_steps: number;
  in_production_hint: number;
  ready_to_ship: number;
  delayed_items: number;
  next_shipment_eta: string | null;
  next_delivery_expected: string | null;
  recent_orders: {
    id: number;
    order_code: string;
    style_ref: string | null;
    status: string;
    pending_approval_steps: number;
    production_summary: string | null;
  }[];
};

export function CustomerDashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const d = (await customerPortalApi.dashboard()) as Dash;
        if (ok) setData(d);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (err) return <PortalErrorState message={err} />;
  if (!data) return <PortalEmptyState title="No data" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted">Overview of your orders and milestones.</p>
      </div>
      <div className={listPageKpiGridClass}>
        <PortalMetricCard label="Active orders" value={data.active_orders} />
        <PortalMetricCard label="Pending approvals" value={data.pending_approval_steps} />
        <PortalMetricCard label="In production (hint)" value={data.in_production_hint} />
        <PortalMetricCard label="Ready to ship" value={data.ready_to_ship} />
        <PortalMetricCard label="Delayed" value={data.delayed_items} />
        <PortalMetricCard label="Next shipment ETA" value={data.next_shipment_eta ?? "—"} />
        <PortalMetricCard label="Next delivery" value={data.next_delivery_expected ?? "—"} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Recent orders</h2>
        {data.recent_orders.length === 0 ? (
          <PortalEmptyState title="No orders yet" hint="When your factory assigns orders to your account, they appear here." />
        ) : (
          <ul className="space-y-2">
            {data.recent_orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-border bg-surface-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/portal/customer/orders/${o.id}`} className="font-medium text-brand-primary hover:underline">
                    {o.order_code}
                  </Link>
                  <Badge variant="secondary">{o.status}</Badge>
                </div>
                {o.style_ref ? <p className="text-xs text-text-muted mt-1">Style: {o.style_ref}</p> : null}
                <p className="text-xs text-text-muted mt-1">
                  Approvals pending: {o.pending_approval_steps}
                  {o.production_summary ? ` · ${o.production_summary}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
