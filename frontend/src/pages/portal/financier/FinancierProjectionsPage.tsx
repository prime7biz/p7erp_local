import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { PortalEmptyState } from "@/components/external-access/PortalEmptyState";
import { ProjectedSalesCard } from "@/components/external-access/ProjectedSalesCard";
import { PortalPageSkeleton } from "@/components/external-access/PortalSkeletons";

export function FinancierProjectionsPage() {
  const { me, loading: authLoading } = useExternalAuth("financier");
  const flags = me?.feature_flags as Record<string, boolean> | undefined;
  const enabled = flags?.financier_projection_enabled === true;

  const [items, setItems] = useState<{ month: string; projected_units: number }[]>([]);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (authLoading || !enabled) return;
    let ok = true;
    setLoadingData(true);
    setErr("");
    (async () => {
      try {
        const x = await financierPortalApi.projections();
        if (ok) setItems(x.items || []);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (ok) setLoadingData(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [authLoading, enabled]);

  if (authLoading && !me) return <PortalPageSkeleton />;
  if (me && !enabled) {
    return (
      <div>
        <AppPageHeader title="Projections" description="Units by delivery month from open orders." />
        <PortalEmptyState
          title="Projections are not enabled"
          hint="Ask your tenant administrator to turn on this feature under Settings → External access."
        />
      </div>
    );
  }

  if (err) return <PortalErrorState message={err} />;
  if (loadingData) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div>
      <AppPageHeader title="Projections" description="Units by delivery month from open orders." />
      <div className="space-y-2 max-w-md">
        {items.map((it) => (
          <ProjectedSalesCard key={it.month} month={it.month} units={it.projected_units} />
        ))}
        {items.length === 0 ? <p className="text-sm text-text-muted">No projection data.</p> : null}
      </div>
    </div>
  );
}
