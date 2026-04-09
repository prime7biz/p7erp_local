import { useEffect, useState } from "react";
import { api, type EligibleOrderForBom } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function BomOrderSelector({
  onSelectOrderId,
  disabled,
}: {
  onSelectOrderId: (orderId: number) => void;
  disabled?: boolean;
}) {
  const [eligible, setEligible] = useState<EligibleOrderForBom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.listEligibleOrdersForBom();
        if (!cancelled) setEligible(rows);
      } catch (e) {
        logApiError("BomOrderSelector.listEligible", e);
        if (!cancelled) setEligible([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-text-muted">Create BOM from order</label>
      <select
        className="min-w-72 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        disabled={disabled || loading}
        value={selected}
        onChange={(e) => {
          const raw = e.target.value;
          const v = Number(raw);
          if (v > 0) {
            onSelectOrderId(v);
            setSelected("");
          }
        }}
      >
        <option value="">{loading ? "Loading eligible orders…" : "Select order (no BOM yet)…"}</option>
        {eligible.map((o) => (
          <option key={o.order_id} value={o.order_id}>
            {o.order_code} · {o.customer_name} · Qty {o.order_qty ?? "—"} · {o.quotation_code}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-text-muted">
        Only orders with a quotation, positive quantity, and no active BOM are listed.
      </p>
    </div>
  );
}
