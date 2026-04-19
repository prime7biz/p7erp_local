import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { ControlTowerOrderRow } from "@/api/client";

function pctLabel(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Math.round(v)}%`;
}

function reservationPill(rs: string | null | undefined) {
  const u = (rs || "—").toUpperCase();
  const cls =
    u === "FIRM_BOOKED" || u === "IN_PROGRESS" || u === "COMPLETED"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
      : u === "SOFT_BOOKED"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
        : u === "DRAFT"
          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
          : u === "CANCELLED"
            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-100"
            : "bg-surface-subtle text-text-secondary";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`} title="Line reservation status">
      {u}
    </span>
  );
}

export function OrderExecutionGrid({
  orders,
  loading,
  highlightOrderId,
}: {
  orders: ControlTowerOrderRow[];
  loading: boolean;
  highlightOrderId?: number | null;
}) {
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenActionsId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (loading) {
    return <p className="text-sm text-text-muted">Loading orders…</p>;
  }

  if (orders.length === 0) {
    return <p className="text-sm text-text-muted">No orders in this delivery window.</p>;
  }

  return (
    <div ref={wrapRef} className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border bg-surface-subtle text-text-secondary">
          <tr>
            <th className="px-3 py-2">Order</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Delivery</th>
            <th className="px-3 py-2">Pipeline</th>
            <th className="px-3 py-2">LC status</th>
            <th className="px-3 py-2">
              Material <span className="text-[10px] font-normal text-text-muted">(actual)</span>
            </th>
            <th className="px-3 py-2">Line</th>
            <th className="px-3 py-2">Reservation</th>
            <th className="px-3 py-2">
              Plan end <span className="text-[10px] font-normal italic text-text-muted">(projected)</span>
            </th>
            <th className="px-3 py-2 w-28">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((row) => {
            const open = openActionsId === row.order_id;
            const hi = highlightOrderId != null && row.order_id === highlightOrderId;
            return (
              <tr
                key={row.order_id}
                className={`border-b border-border-subtle/60 ${hi ? "bg-amber-50/80 dark:bg-amber-950/25" : ""}`}
              >
                <td className="px-3 py-2 font-medium text-text-primary">
                  <Link className="text-status-info hover:underline" to={`/app/orders/${row.order_id}`}>
                    {row.order_code}
                  </Link>
                </td>
                <td className="px-3 py-2 text-text-secondary">{row.customer_name ?? "—"}</td>
                <td className="px-3 py-2 text-text-secondary">{row.delivery_date ?? "—"}</td>
                <td className="px-3 py-2 text-text-secondary">{row.pipeline_status ?? "—"}</td>
                <td className="px-3 py-2 text-text-secondary">{row.lc_status ?? "—"}</td>
                <td className="px-3 py-2 text-text-secondary">{pctLabel(row.material_readiness_pct)}</td>
                <td className="px-3 py-2 text-text-secondary">{row.line_code ?? "—"}</td>
                <td className="px-3 py-2">{reservationPill(row.reservation_status)}</td>
                <td className="px-3 py-2 text-text-secondary italic">{row.planned_end_date ?? "—"}</td>
                <td className="px-3 py-2 relative">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-border dark:text-text-primary dark:hover:bg-surface-subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenActionsId(open ? null : row.order_id);
                    }}
                  >
                    Actions
                  </button>
                  {open ? (
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-border dark:bg-surface-elevated">
                      <Link
                        to={`/app/orders/${row.order_id}`}
                        className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-text-primary dark:hover:bg-surface-subtle"
                        onClick={() => setOpenActionsId(null)}
                      >
                        View order
                      </Link>
                      <Link
                        to={`/app/production/line-plan?from_date=${encodeURIComponent(row.delivery_date?.slice(0, 10) || "")}`}
                        className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-text-primary dark:hover:bg-surface-subtle"
                        onClick={() => setOpenActionsId(null)}
                      >
                        Line plan board
                      </Link>
                      {row.master_contract_id != null ? (
                        <Link
                          to="/app/commercial/master-contracts"
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-text-primary dark:hover:bg-surface-subtle"
                          onClick={() => setOpenActionsId(null)}
                        >
                          Master LCs (list)
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
