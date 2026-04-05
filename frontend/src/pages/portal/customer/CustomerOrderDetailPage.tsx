import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { customerPortalApi } from "@/hooks/useCustomerPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Badge } from "@/components/ui/badge";
import { CustomerOrderProgressCard } from "@/components/external-access/CustomerOrderProgressCard";
import { ShipmentEtaCard } from "@/components/external-access/ShipmentEtaCard";
import { PortalTimelineCard } from "@/components/external-access/PortalTimelineCard";

export function CustomerOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [approvals, setApprovals] = useState<unknown[]>([]);
  const [prod, setProd] = useState<Record<string, unknown> | null>(null);
  const [ship, setShip] = useState<unknown[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let ok = true;
    (async () => {
      try {
        const [o, a, p, s] = await Promise.all([
          customerPortalApi.order(id),
          customerPortalApi.approvals(id),
          customerPortalApi.production(id),
          customerPortalApi.shipmentsOrder(id),
        ]);
        if (!ok) return;
        setOrder(o);
        setApprovals(a);
        setProd(p as Record<string, unknown>);
        setShip(s);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Not found");
      }
    })();
    return () => {
      ok = false;
    };
  }, [id]);

  if (!Number.isFinite(id)) return <PortalErrorState message="Invalid order" />;
  if (err) return <PortalErrorState message={err} />;
  if (!order) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/portal/customer/orders" className="text-sm text-brand-primary hover:underline">
          ← Orders
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">{String(order.order_code)}</h1>
        <Badge variant="secondary">{String(order.status)}</Badge>
      </div>
      <CustomerOrderProgressCard status={String(order.status)} hint={prod?.status_hint as string | undefined} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4 text-sm">
          <p className="font-medium text-text-primary">Overview</p>
          <ul className="mt-2 space-y-1 text-text-muted">
            <li>Style: {order.style_ref ? String(order.style_ref) : "—"}</li>
            <li>Quantity: {order.quantity != null ? String(order.quantity) : "—"}</li>
            <li>Order date: {order.order_date ? String(order.order_date) : "—"}</li>
            <li>Expected delivery: {order.delivery_date ? String(order.delivery_date) : "—"}</li>
            <li>Shipping term: {order.shipping_term ? String(order.shipping_term) : "—"}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-border p-4 text-sm">
          <p className="font-medium text-text-primary">Production</p>
          <p className="mt-2 text-text-muted">
            Work orders: {prod?.work_orders_tracked != null ? String(prod.work_orders_tracked) : "—"}
          </p>
          <p className="text-text-muted">
            Steps: {prod?.operations_completed != null ? String(prod.operations_completed) : "0"} /{" "}
            {prod?.operations_total != null ? String(prod.operations_total) : "0"}
          </p>
        </div>
      </div>
      <PortalTimelineCard title="Approval journey">
        <ul className="space-y-2">
          {(approvals as { id: number; title: string; status: string; planned_date?: string | null }[]).map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary">
              <span className="font-medium">{a.title}</span>
              <span className="text-text-muted"> · {a.status}</span>
              {a.planned_date ? <span className="text-text-muted"> · Planned {a.planned_date}</span> : null}
            </li>
          ))}
        </ul>
        {approvals.length === 0 ? <p className="text-sm text-text-muted">No approval steps recorded yet.</p> : null}
      </PortalTimelineCard>
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-2">Shipments</h2>
        <div className="space-y-2">
          {(ship as { id: number; shipment_reference: string; etd?: string | null; eta?: string | null }[]).map(
            (s) => (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{s.shipment_reference}</p>
                <ShipmentEtaCard etd={s.etd ?? null} eta={s.eta ?? null} />
              </div>
            ),
          )}
          {ship.length === 0 ? <p className="text-sm text-text-muted">No shipments linked yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
