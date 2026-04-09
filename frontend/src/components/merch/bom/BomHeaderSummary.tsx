import { Link } from "react-router-dom";
import type { OrderDrivenBomHeader } from "@/api/client";

function badgeClass(status: string) {
  const s = status.toUpperCase();
  if (s === "FROZEN") return "bg-status-info-subtle text-status-info-foreground border-status-info/25";
  if (s === "APPROVED") return "bg-status-success-subtle text-status-success-foreground border-status-success/25";
  if (s === "SUBMITTED") return "bg-status-warning-subtle text-status-warning-foreground border-status-warning/25";
  if (s === "REJECTED" || s === "CANCELLED") return "bg-status-danger-subtle text-status-danger-foreground border-status-danger/25";
  return "bg-status-neutral-subtle text-status-neutral-foreground border-border";
}

export function BomHeaderSummary({ bom, isLegacy }: { bom: OrderDrivenBomHeader; isLegacy?: boolean }) {
  const st = (bom.status || "DRAFT").toUpperCase();
  return (
    <div className="rounded-xl border border-border bg-surface-subtle/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-text-muted">
            {isLegacy ? "Legacy style BOM" : "Order-driven BOM"} · #{bom.id} · V{bom.version_no}
            {bom.order_id ? (
              <>
                {" "}
                ·{" "}
                <Link className="text-brand-primary hover:underline" to={`/app/orders/${bom.order_id}`}>
                  Order #{bom.order_id}
                </Link>
              </>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            {bom.order_code_snapshot ? <span>Order {bom.order_code_snapshot}</span> : null}
            {bom.quotation_code_snapshot ? (
              <span>
                Quotation {bom.quotation_code_snapshot}
              </span>
            ) : null}
            {bom.order_qty_snapshot != null ? <span>Qty {bom.order_qty_snapshot}</span> : null}
            {bom.currency_snapshot ? <span>{bom.currency_snapshot}</span> : null}
          </div>
          {bom.rejection_comment ? (
            <p className="mt-2 text-xs text-status-warning-foreground">Last rejection: {bom.rejection_comment}</p>
          ) : null}
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(st)}`}>{st}</span>
      </div>
    </div>
  );
}
