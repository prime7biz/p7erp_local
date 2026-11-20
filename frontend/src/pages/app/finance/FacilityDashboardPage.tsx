import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { FormSection, SummaryStrip } from "@/components/finance/kit";

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
    <div className="space-y-4">
      <AppPageHeader
        title="Facilities dashboard"
        description="Debt and EMI aggregates (tenant-wide)."
        actions={
          <Link to="/app/finance/facilities" className="text-sm text-brand-primary">
            All facilities →
          </Link>
        }
      />
      {summaryErr ? <p className="text-sm text-red-600">{summaryErr}</p> : null}
      <SummaryStrip
        items={[
          { key: "count", label: "Facilities", value: String(summary?.facilities_count ?? "—") },
          { key: "debt", label: "Active debt (principal)", value: String(summary?.active_debt_principal ?? "—") },
          {
            key: "emi",
            label: "Open schedule EMI (sum lines)",
            value: String(summary?.schedule_emi_outstanding_all_lines ?? "—"),
          },
        ]}
      />
      <FormSection title="Upcoming obligations by month">
        {obligationsErr ? <p className="text-sm text-red-600">{obligationsErr}</p> : null}
        <pre className="max-h-64 overflow-auto text-xs text-text-muted">
          {!obligationsErr && ob ? JSON.stringify(ob, null, 2) : "—"}
        </pre>
      </FormSection>
      {summary?.note ? <p className="text-xs text-text-muted">{String(summary.note)}</p> : null}
    </div>
  );
}
