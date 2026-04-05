import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { GoodsMovementSummaryCard } from "@/components/external-access/GoodsMovementSummaryCard";

export function FinancierGoodsMovementPage() {
  const [g, setG] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.goodsMovement();
        if (ok) setG(x as Record<string, number>);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;
  if (!g) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div>
      <AppPageHeader title="Goods movement" description="Inventory movement row counts (no unit costs)." />
      <GoodsMovementSummaryCard
        inCount={Number(g.movements_in_count ?? 0)}
        outCount={Number(g.movements_out_count ?? 0)}
        adjust={Number(g.movements_adjust_count ?? 0)}
        recent={Number(g.last_30_days_total ?? 0)}
      />
    </div>
  );
}
