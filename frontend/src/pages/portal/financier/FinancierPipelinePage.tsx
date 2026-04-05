import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { PortalMetricCard } from "@/components/external-access/PortalMetricCard";

export function FinancierPipelinePage() {
  const [p, setP] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.pipeline();
        if (ok) setP(x as Record<string, number>);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;
  if (!p) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div>
      <AppPageHeader title="Pipeline" description="Inquiry and quotation funnel (counts)." />
      <div className={listPageKpiGridClass}>
        <PortalMetricCard label="Inquiries open" value={p.inquiries_open} />
        <PortalMetricCard label="Inquiries submitted" value={p.inquiries_submitted} />
        <PortalMetricCard label="Quotations open" value={p.quotations_open} />
        <PortalMetricCard label="Quotations sent" value={p.quotations_sent} />
      </div>
    </div>
  );
}
