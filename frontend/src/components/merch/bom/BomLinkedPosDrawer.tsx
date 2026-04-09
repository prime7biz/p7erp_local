import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function BomLinkedPosDrawer({
  open,
  lineId,
  onClose,
}: {
  open: boolean;
  lineId: number | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      purchase_order_id: number;
      po_code: string;
      status: string;
      line_quantity: string;
      unit_price: string;
      received_qty: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !lineId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await api.getLinkedPurchaseOrdersForOrderBomLine(lineId);
        if (!cancelled) setRows(r.items);
      } catch (e) {
        logApiError("BomLinkedPosDrawer", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lineId]);

  if (!open || lineId == null) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface-raised p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-text-primary">Linked purchase orders</h3>
          <button type="button" className="text-sm text-text-muted hover:text-text-primary" onClick={onClose}>
            ✕
          </button>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">No PO lines linked to this BOM row.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((r) => (
              <li key={`${r.purchase_order_id}-${r.po_code}`} className="rounded-lg border border-border p-3 text-sm">
                <div className="font-medium text-text-primary">{r.po_code}</div>
                <div className="text-xs text-text-muted">
                  Status: {r.status} · Qty {r.line_quantity} @ {r.unit_price} · Received {r.received_qty}
                </div>
                <Link
                  className="mt-1 inline-block text-xs text-brand-primary hover:underline"
                  to="/app/inventory/purchase-orders"
                >
                  Open PO list
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
