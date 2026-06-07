import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type Row = {
  order_id: number;
  order_code: string;
  buyer_name: string | null;
  order_qty: number;
  cutting_status: string;
  cutting_pct: number;
  sewing_status: string;
  sewing_pct: number;
  finishing_status: string;
  finishing_pct: number;
  inspection_status: string;
  inspection_pass_rate: number | null;
  shipment_target_date: string | null;
  actual_shipment_date: string | null;
};

function ProgressBar({ pct }: { pct: number }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="mt-1 h-1.5 w-full min-w-[48px] rounded-full bg-surface-muted">
      <div className="h-1.5 rounded-full bg-brand-primary" style={{ width: `${w}%` }} />
    </div>
  );
}

function stageBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes("complete")) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (s.includes("progress") || s.includes("review")) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (s.includes("not_started") || s.includes("not started")) return "bg-surface-subtle text-text-muted";
  return "bg-surface-subtle text-text-primary";
}

export function FinancierProductionTrackerPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.productionTracker();
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
        <h1 className="text-lg font-semibold text-text-primary">Production tracking</h1>
        <p className="mt-1 text-xs text-text-muted">
          Aggregated cutting, sewing, finishing, QC and shipment milestones for financed orders (indicative).
        </p>
      </div>
      {note ? <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-muted">{note}</p> : null}
      {items.length === 0 && !note ? <p className="text-sm text-text-muted">No rows.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className={listTableHeadCellClass}>Order</th>
              <th className={listTableHeadCellClass}>Buyer</th>
              <th className={listTableHeadCellClass}>Qty</th>
              <th className={listTableHeadCellClass}>Cutting</th>
              <th className={listTableHeadCellClass}>Sewing</th>
              <th className={listTableHeadCellClass}>Finishing</th>
              <th className={listTableHeadCellClass}>Inspection</th>
              <th className={listTableHeadCellClass}>Ship target</th>
              <th className={listTableHeadCellClass}>Ship actual</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.order_id} className={listTableRowClass}>
                <td className="px-2 py-2">
                  <Link to={`/portal/financier/orders/${r.order_id}`} className="font-medium text-brand-primary hover:underline">
                    {r.order_code}
                  </Link>
                </td>
                <td className="px-2 py-2">{r.buyer_name ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{r.order_qty}</td>
                <td className="px-2 py-2 min-w-[88px]">
                  <span className={`rounded px-1.5 py-0.5 ${stageBadge(r.cutting_status)}`}>
                    {r.cutting_status} {r.cutting_pct}%
                  </span>
                  <ProgressBar pct={r.cutting_pct} />
                </td>
                <td className="px-2 py-2 min-w-[88px]">
                  <span className={`rounded px-1.5 py-0.5 ${stageBadge(r.sewing_status)}`}>
                    {r.sewing_status} {r.sewing_pct}%
                  </span>
                  <ProgressBar pct={r.sewing_pct} />
                </td>
                <td className="px-2 py-2 min-w-[88px]">
                  <span className={`rounded px-1.5 py-0.5 ${stageBadge(r.finishing_status)}`}>
                    {r.finishing_status} {r.finishing_pct}%
                  </span>
                  <ProgressBar pct={r.finishing_pct} />
                </td>
                <td className="px-2 py-2">
                  <span className="text-text-primary">{r.inspection_status}</span>
                  {r.inspection_pass_rate != null ? (
                    <span className="ml-1 text-text-muted">({r.inspection_pass_rate}% pass)</span>
                  ) : null}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{r.shipment_target_date ?? "—"}</td>
                <td className="px-2 py-2 whitespace-nowrap">{r.actual_shipment_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
