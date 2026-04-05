import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Badge } from "@/components/ui/badge";

export function FinancierOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const [o, setO] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.order(id);
        if (ok) setO(x);
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
  if (!o) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <Link to="/portal/financier/order-book" className="text-sm text-brand-primary hover:underline">
        ← Order book
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-text-primary">{String(o.order_code)}</h1>
        <Badge variant="secondary">{String(o.status)}</Badge>
      </div>
      <div className="rounded-xl border border-border p-4 text-sm space-y-1 text-text-muted">
        <p>Buyer: {o.buyer_name ? String(o.buyer_name) : "—"}</p>
        <p>Quantity: {o.quantity != null ? String(o.quantity) : "—"}</p>
        <p>Order date: {o.order_date ? String(o.order_date) : "—"}</p>
        <p>Delivery: {o.delivery_date ? String(o.delivery_date) : "—"}</p>
      </div>
    </div>
  );
}
