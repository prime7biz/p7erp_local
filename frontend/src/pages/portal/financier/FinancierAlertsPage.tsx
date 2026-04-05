import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { RiskSignalsCard } from "@/components/external-access/RiskSignalsCard";

export function FinancierAlertsPage() {
  const [items, setItems] = useState<{ code: string; severity: string; title: string; detail: string }[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.alerts();
        if (ok) setItems(x.items || []);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div>
      <AppPageHeader title="Risk signals" description="Advisory indicators — not financial advice." />
      <div className="space-y-3">
        {items.map((a) => (
          <RiskSignalsCard key={a.code} title={a.title} detail={a.detail} severity={a.severity} />
        ))}
        {items.length === 0 ? <p className="text-sm text-text-muted">No active alerts.</p> : null}
      </div>
    </div>
  );
}
