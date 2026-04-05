import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { PortalEmptyState } from "@/components/external-access/PortalEmptyState";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { PortalMetricCard } from "@/components/external-access/PortalMetricCard";
import { PortalPageSkeleton } from "@/components/external-access/PortalSkeletons";

export function FinancierFinancialSummaryPage() {
  const { me, loading: authLoading } = useExternalAuth("financier");
  const flags = me?.feature_flags as Record<string, boolean> | undefined;
  const enabled = flags?.financier_financial_summary_enabled === true;

  const [f, setF] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (authLoading || !enabled) return;
    let ok = true;
    setLoadingData(true);
    setErr("");
    (async () => {
      try {
        const x = await financierPortalApi.financialSummary();
        if (ok) setF(x);
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
        <AppPageHeader title="Financial summary" description="Ledger-style aggregates for your relationship manager." />
        <PortalEmptyState
          title="Financial summary is not enabled"
          hint="Ask your tenant administrator to turn on this feature under Settings → External access."
        />
      </div>
    );
  }

  if (err) return <PortalErrorState message={err} />;
  if (loadingData || !f) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div>
      <AppPageHeader title="Financial summary" description={String(f.note ?? "Controlled counts only.")} />
      <div className={listPageKpiGridClass}>
        <PortalMetricCard label="Vouchers (90d)" value={Number(f.voucher_count_90d ?? 0)} />
        <PortalMetricCard label="Receivable bills (open)" value={Number(f.receivable_bills_open ?? 0)} />
        <PortalMetricCard label="Payables (open)" value={Number(f.payables_open ?? 0)} />
      </div>
    </div>
  );
}
