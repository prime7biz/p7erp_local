import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Badge } from "@/components/ui/badge";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";

type Row = {
  id: number;
  order_code: string;
  buyer_name: string | null;
  status: string;
  quantity: number | null;
  expected_delivery: string | null;
  pipeline_status?: string | null;
  sewing_pct?: number | null;
  outstanding_finance?: number | null;
  finance_currency?: string | null;
};

export function FinancierOrderBookPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      try {
        const r = await financierPortalApi.orderBook({ limit: 100, offset: 0, financed_only: true });
        if (ok) {
          setItems((r.items || []) as Row[]);
          setTotal(r.total);
        }
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div>
      <AppPageHeader
        title="Order book"
        description={loading ? "Loading…" : `${total} financed orders with pipeline and production summary.`}
      />
      {loading ? (
        <p className="text-sm text-text-muted py-6">Loading order book…</p>
      ) : (
        <>
          <ResponsiveTableContainer>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={listTableHeadCellClass}>Order</th>
                  <th className={listTableHeadCellClass}>Buyer</th>
                  <th className={listTableHeadCellClass}>Status</th>
                  <th className={listTableHeadCellClass}>Qty</th>
                  <th className={listTableHeadCellClass}>Pipeline</th>
                  <th className={listTableHeadCellClass}>Sewing %</th>
                  <th className={listTableHeadCellClass}>Outstanding</th>
                  <th className={listTableHeadCellClass}>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className={listTableRowClass}>
                    <td className="px-3 py-2">
                      <Link to={`/portal/financier/orders/${o.id}`} className="text-brand-primary hover:underline">
                        {o.order_code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{o.buyer_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2">{o.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-text-muted">{o.pipeline_status ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{o.sewing_pct != null ? `${o.sewing_pct}%` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-xs">
                      {o.outstanding_finance != null
                        ? `${o.outstanding_finance.toLocaleString()} ${o.finance_currency ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{o.expected_delivery ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableContainer>
          {items.length === 0 ? <p className="text-sm text-text-muted py-4">No orders in scope.</p> : null}
        </>
      )}
    </div>
  );
}
