import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerPortalApi } from "@/hooks/useCustomerPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { ShipmentEtaCard } from "@/components/external-access/ShipmentEtaCard";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: number;
  order_id: number | null;
  order_code: string | null;
  shipment_reference: string;
  status: string;
  carrier?: string | null;
  etd?: string | null;
  eta?: string | null;
};

export function CustomerShipmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = (await customerPortalApi.shipments()) as Row[];
        if (ok) setRows(r);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div>
      <AppPageHeader title="Shipments" description="Planned and in-transit shipments for your orders." />
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted py-8">No shipments visible.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-text-primary">{r.shipment_reference}</span>
                <Badge variant="secondary">{r.status}</Badge>
              </div>
              {r.order_id ? (
                <p className="text-sm mt-2">
                  Order:{" "}
                  <Link className="text-brand-primary hover:underline" to={`/portal/customer/orders/${r.order_id}`}>
                    {r.order_code ?? `#${r.order_id}`}
                  </Link>
                </p>
              ) : null}
              {r.carrier ? <p className="text-xs text-text-muted mt-1">Carrier: {r.carrier}</p> : null}
              <div className="mt-2">
                <ShipmentEtaCard etd={r.etd ?? null} eta={r.eta ?? null} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
