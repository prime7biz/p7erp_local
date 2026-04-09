import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function FacilityDashboardPage() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [ob, setOb] = useState<Record<string, unknown> | null>(null);
  const [summaryErr, setSummaryErr] = useState("");
  const [obligationsErr, setObligationsErr] = useState("");

  useEffect(() => {
    void (async () => {
      setSummaryErr("");
      setObligationsErr("");
      const [sumRes, obRes] = await Promise.allSettled([
        api.getFacilitySummary(),
        api.getFacilityUpcomingObligations(),
      ]);
      if (sumRes.status === "fulfilled") {
        setSummary(sumRes.value);
      } else {
        logApiError("FacilityDashboardPage.summary", sumRes.reason);
        setSummary(null);
        setSummaryErr(errMessage(sumRes.reason));
      }
      if (obRes.status === "fulfilled") {
        setOb(obRes.value as Record<string, unknown>);
      } else {
        logApiError("FacilityDashboardPage.obligations", obRes.reason);
        setOb(null);
        setObligationsErr(errMessage(obRes.reason));
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Facilities dashboard</h1>
          <p className="text-sm text-text-muted">Debt and EMI aggregates (tenant-wide).</p>
        </div>
        <Link to="/app/finance/facilities" className="text-sm text-brand-primary">
          All facilities →
        </Link>
      </div>
      {summaryErr ? <p className="text-sm text-red-600">{summaryErr}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs text-text-muted">Facilities</p>
          <p className="text-2xl font-semibold">{String(summary?.facilities_count ?? "—")}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs text-text-muted">Active debt (principal)</p>
          <p className="text-2xl font-semibold">{String(summary?.active_debt_principal ?? "—")}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs text-text-muted">Open schedule EMI (sum lines)</p>
          <p className="text-2xl font-semibold">{String(summary?.schedule_emi_outstanding_all_lines ?? "—")}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold">Upcoming obligations by month</h2>
        {obligationsErr ? <p className="mt-2 text-sm text-red-600">{obligationsErr}</p> : null}
        <pre className="mt-2 max-h-64 overflow-auto text-xs text-text-muted">
          {!obligationsErr && ob ? JSON.stringify(ob, null, 2) : "—"}
        </pre>
      </div>
      {summary?.note ? <p className="text-xs text-text-muted">{String(summary.note)}</p> : null}
    </div>
  );
}
