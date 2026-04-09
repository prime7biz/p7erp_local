import { useEffect, useMemo, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type Row = {
  btb_lc_id: number | null;
  po_code: string;
  order_code: string | null;
  btb_lc_reference: string | null;
  btb_lc_status: string | null;
  btb_lc_opened: boolean;
  supplier_name: string | null;
  material_category: string | null;
  item_code: string;
  item_name: string | null;
  qty_ordered: number;
  qty_received: number;
  qty_pending: number;
  warehouse_name: string | null;
  in_house_status: string;
};

export function FinancierRawMaterialPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.rawMaterialTracker();
        setItems((d.items as Row[]) ?? []);
        setNote(typeof d.note === "string" ? d.note : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of items) {
      const k = r.btb_lc_id != null ? `btb-${r.btb_lc_id}` : "unknown";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [items]);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Raw material tracking</h1>
        <p className="mt-1 text-xs text-text-muted">BTB-linked purchase lines: supplier, category, receipts, warehouse, in-house status.</p>
      </div>
      {note ? <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-muted">{note}</p> : null}
      {items.length === 0 && !note ? <p className="text-sm text-text-muted">No rows.</p> : null}
      {grouped.map(([btbKey, rows]) => (
        <section key={btbKey} className="rounded-xl border border-border bg-surface-raised p-3">
          <h2 className="text-sm font-semibold text-text-primary">
            BTB: {rows[0]?.btb_lc_reference ?? btbKey}
          </h2>
          <p className="text-[11px] text-text-muted">
            Status: {rows[0]?.btb_lc_status ?? "—"} · LC opened (non-draft): {rows[0]?.btb_lc_opened ? "yes" : "no"}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className={listTableHeadCellClass}>PO</th>
                  <th className={listTableHeadCellClass}>Order</th>
                  <th className={listTableHeadCellClass}>Supplier</th>
                  <th className={listTableHeadCellClass}>Category</th>
                  <th className={listTableHeadCellClass}>Item</th>
                  <th className={listTableHeadCellClass}>Ordered</th>
                  <th className={listTableHeadCellClass}>Received</th>
                  <th className={listTableHeadCellClass}>Pending</th>
                  <th className={listTableHeadCellClass}>Warehouse</th>
                  <th className={listTableHeadCellClass}>In-house</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.po_code}-${r.item_code}-${i}`} className={listTableRowClass}>
                    <td className="px-2 py-1.5">{r.po_code}</td>
                    <td className="px-2 py-1.5">{r.order_code ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.supplier_name ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.material_category ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {r.item_code} {r.item_name ? <span className="text-text-muted">({r.item_name})</span> : null}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{r.qty_ordered}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.qty_received}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.qty_pending}</td>
                    <td className="px-2 py-1.5">{r.warehouse_name ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          r.in_house_status === "fully_received"
                            ? "text-emerald-700"
                            : r.in_house_status === "partial"
                              ? "text-amber-700"
                              : "text-text-muted"
                        }
                      >
                        {r.in_house_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
