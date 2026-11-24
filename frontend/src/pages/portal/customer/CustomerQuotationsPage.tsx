import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { customerPortalQuotationsApi, portalQuotationsEnabled, type PortalQuotation } from "@/api/customerPortalQuotations";
import type { PortalOutletContext } from "@/types/portalOutlet";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listTableHeadCellClass,
  listTableRowClass,
} from "@/components/app/listPageLayout";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { useListPagination } from "@/hooks/useListPagination";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import { logApiError } from "@/utils/logApiError";

export function CustomerQuotationsPage() {
  const { me } = useOutletContext<PortalOutletContext>();
  const enabled = portalQuotationsEnabled(me?.feature_flags as Record<string, unknown> | undefined);
  const { page, pageSize, setPage, setPageSize, offset } = useListPagination();
  const [items, setItems] = useState<PortalQuotation[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let ok = true;
    (async () => {
      setLoading(true);
      try {
        const r = await customerPortalQuotationsApi.list({ limit: pageSize, offset });
        if (!ok) return;
        setItems(r.items ?? []);
        setTotal(r.total ?? 0);
        setErr("");
      } catch (e) {
        logApiError("CustomerQuotationsPage.list", e);
        if (ok) setErr(e instanceof Error ? e.message : "Failed to load quotations");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [enabled, pageSize, offset]);

  if (!enabled) {
    return (
      <div>
        <AppPageHeader title="Quotations" description="Quotations sent to you by your supplier." />
        <div className={listPageEmptyClass}>Quotations are not enabled for this organization.</div>
      </div>
    );
  }

  return (
    <div>
      <AppPageHeader title="Quotations" description="Quotations sent to you. Open one to accept it or ask for a revision." />
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      {loading ? <p className="p-6 text-sm text-text-muted">Loading…</p> : null}
      {!loading && !err && items.length === 0 ? <div className={listPageEmptyClass}>No quotations yet.</div> : null}
      {!loading && items.length > 0 ? (
        <>
          <ResponsiveTableContainer>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={listTableHeadCellClass}>Quotation</th>
                  <th className={listTableHeadCellClass}>Style</th>
                  <th className={listTableHeadCellClass}>Qty</th>
                  <th className={listTableHeadCellClass}>Unit price</th>
                  <th className={listTableHeadCellClass}>Total</th>
                  <th className={listTableHeadCellClass}>Valid until</th>
                  <th className={listTableHeadCellClass}>Your answer</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id} className={listTableRowClass}>
                    <td className="px-3 py-2">
                      <Link className="text-brand-primary hover:underline" to={`/portal/customer/quotations/${q.id}`}>
                        {q.quotation_code}
                      </Link>
                      <span className="ml-1 text-xs text-text-muted">v{q.version_no}</span>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{q.style_ref ?? "—"}</td>
                    <td className="px-3 py-2">{q.quantity ?? "—"}</td>
                    <td className="px-3 py-2">
                      {q.quoted_unit_price ?? "—"} {q.currency ?? ""}
                    </td>
                    <td className="px-3 py-2">
                      {q.total_amount ?? "—"} {q.currency ?? ""}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{q.valid_until ?? "—"}</td>
                    <td className="px-3 py-2">
                      {q.my_last_response ? (
                        <Badge variant="secondary">
                          {q.my_last_response === "ACCEPT" ? "Accepted" : "Revision requested"}
                        </Badge>
                      ) : (
                        <span className="text-text-muted">Waiting</span>
                      )}
                    </td>
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
