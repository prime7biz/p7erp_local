import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchKpiCards, fetchKpiEvidence, seedKpiDefinitions, type KpiCard } from "@/api/kpiEngine";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { KpiGrid } from "@/components/kpi/KpiGrid";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

const DASHBOARDS = [
  { id: "executive", label: "Executive" },
  { id: "merchandising", label: "Merchandising" },
  { id: "sales", label: "Sales" },
  { id: "ppc", label: "PPC" },
  { id: "production", label: "Production" },
  { id: "quality", label: "Quality" },
  { id: "inventory", label: "Inventory" },
  { id: "finance", label: "Finance" },
  { id: "commercial", label: "Commercial" },
  { id: "hr", label: "HR" },
  { id: "agent", label: "Agent" },
  { id: "buying_office", label: "Buying office" },
] as const;

export default function KpiDashboardPage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const dashboard = params.get("dashboard") || "executive";
  const enabled = me?.feature_flags?.kpi_engine_v1 === true;
  const [cards, setCards] = useState<KpiCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{
    code: string;
    rows: Array<Record<string, unknown>>;
    valueStatus: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchKpiCards(dashboard)
      .then((res) => {
        if (!cancelled) setCards(res.items || []);
      })
      .catch((err) => {
        logApiError("kpi.cards", err);
        if (!cancelled) setError("Could not load KPI cards.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dashboard, enabled]);

  if (!enabled) {
    return (
      <div className="space-y-4 p-4">
        <AppPageHeader title="KPI cockpit" description="Governed apparel KPIs" />
        <p className="text-sm text-text-muted">
          The KPI engine is off. An admin can enable <code>kpi_engine_v1</code> in Settings → Configuration.
        </p>
      </div>
    );
  }

  async function onSeed() {
    try {
      await seedKpiDefinitions();
      const res = await fetchKpiCards(dashboard);
      setCards(res.items || []);
    } catch (err) {
      logApiError("kpi.seed", err);
      setError("Seed failed.");
    }
  }

  async function onDrill(code: string) {
    try {
      const res = await fetchKpiEvidence(code);
      setEvidence({ code, rows: res.evidence || [], valueStatus: res.value?.status || "" });
    } catch (err) {
      logApiError("kpi.evidence", err);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <AppPageHeader
        title="KPI cockpit"
        description="Governed measures with targets, freshness and drill-down"
        actions={
          <button
            type="button"
            onClick={onSeed}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
          >
            Seed definitions
          </button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {DASHBOARDS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setParams({ dashboard: d.id })}
            className={`rounded-full border px-3 py-1 text-xs ${
              dashboard === d.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:bg-surface-muted"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error ? <KpiGrid cards={cards} onDrill={onDrill} /> : null}

      {evidence ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-border bg-surface p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Evidence · {evidence.code}</h2>
            <button type="button" className="text-xs text-text-muted" onClick={() => setEvidence(null)}>
              Close
            </button>
          </div>
          <p className="mb-2 text-xs text-text-muted">Status: {evidence.valueStatus}</p>
          <ul className="max-h-[80vh] space-y-2 overflow-auto text-sm">
            {evidence.rows.length === 0 ? (
              <li className="text-text-muted">No evidence rows for this KPI yet.</li>
            ) : (
              evidence.rows.map((row, idx) => (
                <li key={idx} className="rounded border border-border p-2">
                  <pre className="whitespace-pre-wrap text-[11px]">{JSON.stringify(row, null, 2)}</pre>
                  {typeof row.href === "string" ? (
                    <Link className="text-xs text-accent" to={row.href}>
                      Open record
                    </Link>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
