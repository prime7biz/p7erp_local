import { useEffect, useMemo, useState } from "react";
import { api, type EligibleOrderForBom } from "@/api/client";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
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
  const [selected, setSelected] = useState<number | "">("");

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

  const options = useMemo(
    () =>
      eligible.map((o) => ({
        value: o.order_id,
        label: `${o.order_code} · ${o.customer_name} · Qty ${o.order_qty ?? "—"} · ${o.quotation_code}`,
      })),
    [eligible],
  );

  return (
    <div>
      <label htmlFor="bom-order-selector" className="mb-0.5 block text-xs font-medium text-text-muted">
        Create BOM from order
      </label>
      <LocalSearchSelect
        id="bom-order-selector"
        className="min-w-72"
        value={selected}
        options={options}
        disabled={disabled || loading}
        placeholder={loading ? "Loading eligible orders…" : "Select order (no BOM yet)…"}
        aria-label="Create BOM from order"
        allowClear
        onChange={(next) => {
          if (next === "") {
            setSelected("");
            return;
          }
          const v = Number(next);
          if (v > 0) {
            onSelectOrderId(v);
            setSelected("");
          }
        }}
      />
      <p className="mt-1 text-xs text-text-muted">
        Only orders with a quotation, positive quantity, and no active BOM are listed. Type to filter by order or customer.
      </p>
    </div>
  );
}
