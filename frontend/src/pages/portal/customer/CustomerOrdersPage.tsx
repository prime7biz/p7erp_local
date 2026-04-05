import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerPortalApi } from "@/hooks/useCustomerPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listTableHeadCellClass,
  listTableRowClass,
  erpControlFocusClass,
} from "@/components/app/listPageLayout";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { useListPagination } from "@/hooks/useListPagination";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";

type Row = {
  id: number;
  order_code: string;
  style_ref: string | null;
  status: string;
  quantity: number | null;
  order_date: string | null;
  delivery_date: string | null;
  pending_approval_steps: number;
};

export function CustomerOrdersPage() {
  const { page, pageSize, setPage, setPageSize, offset } = useListPagination();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      try {
        const r = await customerPortalApi.orders({ limit: pageSize, offset, search: search || undefined });
        if (!ok) return;
        setItems((r.items || []) as Row[]);
        setTotal(r.total ?? 0);
        setErr("");
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [page, pageSize, offset, search]);

  return (
    <div>
      <AppPageHeader title="My orders" description="Orders linked to your customer account." />
      <div className={listPageFilterBarClass}>
        <input
          placeholder="Search order / style…"
          className={`rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      {loading ? <p className="text-sm text-text-muted p-6">Loading…</p> : null}
      {!loading && !err && items.length === 0 ? (
        <div className={listPageEmptyClass}>No orders found.</div>
      ) : null}
      {!loading && items.length > 0 ? (
        <>
          <ResponsiveTableContainer>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={listTableHeadCellClass}>Order</th>
                  <th className={listTableHeadCellClass}>Style</th>
                  <th className={listTableHeadCellClass}>Status</th>
                  <th className={listTableHeadCellClass}>Qty</th>
                  <th className={listTableHeadCellClass}>Delivery</th>
                  <th className={listTableHeadCellClass}>Approvals</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className={listTableRowClass}>
                    <td className="px-3 py-2">
                      <Link className="text-brand-primary hover:underline" to={`/portal/customer/orders/${o.id}`}>
                        {o.order_code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{o.style_ref ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2">{o.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-text-muted">{o.delivery_date ?? "—"}</td>
                    <td className="px-3 py-2">{o.pending_approval_steps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableContainer>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : null}
    </div>
  );
}
