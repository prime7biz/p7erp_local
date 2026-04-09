import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type Row = {
  order_id: number;
  order_code: string;
  buyer_name: string | null;
  fob_value: number | null;
  fob_currency: string | null;
  approved_finance_amount: number;
  utilized_finance_amount: number;
  outstanding_finance_amount: number;
  finance_currency: string | null;
  order_status: string;
};

export function FinancierOrderFinancePage() {
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.orderFinance();
        setItems((d.items as Row[]) ?? []);
        setNote(typeof d.note === "string" ? d.note : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Order-level finance</h1>
        <p className="mt-1 text-xs text-text-muted">
          FOB-style values and linked facility utilizations for orders on your BTB / master contract chain. Utilized = principal
          repaid to date (approved − outstanding).
        </p>
      </div>
      {note ? <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-muted">{note}</p> : null}
      {items.length === 0 && !note ? (
        <p className="text-sm text-text-muted">No rows.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={listTableHeadCellClass}>Order</th>
                <th className={listTableHeadCellClass}>Buyer</th>
                <th className={listTableHeadCellClass}>FOB</th>
                <th className={listTableHeadCellClass}>Approved</th>
                <th className={listTableHeadCellClass}>Utilized (repaid)</th>
                <th className={listTableHeadCellClass}>Outstanding</th>
                <th className={listTableHeadCellClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.order_id} className={listTableRowClass}>
                  <td className="px-3 py-2">
                    <Link to={`/portal/financier/orders/${r.order_id}`} className="font-medium text-brand-primary hover:underline">
                      {r.order_code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.buyer_name ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.fob_value != null ? `${r.fob_value.toLocaleString()} ${r.fob_currency ?? ""}`.trim() : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.approved_finance_amount.toLocaleString()} {r.finance_currency ?? ""}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.utilized_finance_amount.toLocaleString()} {r.finance_currency ?? ""}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.outstanding_finance_amount.toLocaleString()} {r.finance_currency ?? ""}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.order_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
