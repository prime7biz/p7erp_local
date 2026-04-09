import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  Gauge,
  Landmark,
  LineChart,
  Sparkles,
  Wallet,
} from "lucide-react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { AiMetaDisplay, type AiGovernanceMetaView } from "@/components/external-access/AiMetaDisplay";
import { logApiError } from "@/utils/logApiError";

type ReportBlock = {
  id: string;
  title: string;
  accent: string;
  bullets: string[];
};

type Widgets = {
  tenant_name?: string;
  base_currency?: string;
  health_score?: number;
  debt_to_asset_ratio?: number;
  liquid_funds?: number;
  receivables_open?: number;
  payables_open?: number;
  active_debt_principal?: number;
  open_orders_count?: number;
  total_inventory_value?: number;
  cogs_outbound_90d?: number;
  stock_movements_last_30?: number;
  inquiries_open?: number;
  quotations_active?: number;
  alerts_total?: number;
  alerts_by_severity?: Record<string, number>;
  party_linked?: boolean;
  facilities_count?: number;
  total_sanctioned?: number;
  total_utilized?: number;
  btb_lc_count?: number;
};

type FacilityRow = {
  facility_code: string;
  facility_type: string;
  status: string;
  currency: string | null;
  sanctioned_amount: number;
  utilized_amount: number;
  available_amount: number;
};

const ACCENT_STYLES: Record<string, string> = {
  sky: "border-l-sky-500 bg-gradient-to-br from-sky-50/90 to-white dark:from-sky-950/30 dark:to-surface-raised",
  violet: "border-l-violet-500 bg-gradient-to-br from-violet-50/90 to-white dark:from-violet-950/30 dark:to-surface-raised",
  emerald: "border-l-emerald-500 bg-gradient-to-br from-emerald-50/90 to-white dark:from-emerald-950/30 dark:to-surface-raised",
  amber: "border-l-amber-500 bg-gradient-to-br from-amber-50/90 to-white dark:from-amber-950/30 dark:to-surface-raised",
  indigo: "border-l-indigo-500 bg-gradient-to-br from-indigo-50/90 to-white dark:from-indigo-950/30 dark:to-surface-raised",
  rose: "border-l-rose-500 bg-gradient-to-br from-rose-50/90 to-white dark:from-rose-950/30 dark:to-surface-raised",
  orange: "border-l-orange-500 bg-gradient-to-br from-orange-50/90 to-white dark:from-orange-950/30 dark:to-surface-raised",
};

function fmtMoney(n: number | undefined, ccy?: string) {
  if (n == null || Number.isNaN(n)) return "—";
  const cur = (ccy ?? "").trim();
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return cur ? `${cur} ${s}` : s;
}

function pct(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function HealthRing({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const color = s > 70 ? "text-emerald-600" : s >= 40 ? "text-amber-600" : "text-red-600";
  const bg = s > 70 ? "stroke-emerald-500" : s >= 40 ? "stroke-amber-500" : "stroke-red-500";
  const circ = 2 * Math.PI * 36;
  const dash = (s / 100) * circ;
  return (
    <div className="relative flex h-[100px] w-[100px] flex-col items-center justify-center">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r="36" fill="none" className="stroke-border" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          className={bg}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center ${color}`}>
        <span className="text-2xl font-bold tabular-nums">{Math.round(s)}</span>
        <span className="text-[10px] font-medium uppercase text-text-muted">Health</span>
      </div>
    </div>
  );
}

export function FinancierAiConfidencePage() {
  const [narrative, setNarrative] = useState("");
  const [meta, setMeta] = useState<AiGovernanceMetaView | null>(null);
  const [reports, setReports] = useState<ReportBlock[]>([]);
  const [widgets, setWidgets] = useState<Widgets | null>(null);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [flags, setFlags] = useState<{ ai_narrative_enabled?: boolean; external_ai_requires_approval?: boolean }>({});
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const data = await financierPortalApi.aiConfidence();
        setNarrative(typeof data.narrative === "string" ? data.narrative : "");
        const m = data.meta as Record<string, unknown> | undefined;
        setMeta(m && typeof m === "object" ? (m as AiGovernanceMetaView) : null);
        setReports(Array.isArray(data.reports) ? (data.reports as ReportBlock[]) : []);
        setWidgets((data.widgets as Widgets) ?? null);
        setFacilities(Array.isArray(data.facilities) ? (data.facilities as FacilityRow[]) : []);
        setFlags({
          ai_narrative_enabled: data.ai_narrative_enabled === true,
          external_ai_requires_approval: data.external_ai_requires_approval === true,
        });
      } catch (e) {
        logApiError("financier ai confidence", e);
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const ccy = widgets?.base_currency ?? "BDT";

  const pending = meta?.tenant_review_required && !meta?.approved_for_external;

  const severityChips = useMemo(() => {
    const m = widgets?.alerts_by_severity;
    if (!m || typeof m !== "object") return [];
    return Object.entries(m).map(([k, v]) => (
      <span
        key={k}
        className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase text-violet-900 dark:bg-violet-950 dark:text-violet-200"
      >
        {k}: {v}
      </span>
    ));
  }, [widgets?.alerts_by_severity]);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-600/10 via-fuchsia-500/10 to-cyan-500/10 p-5 shadow-sm dark:border-violet-900/40 dark:from-violet-950/40 dark:via-fuchsia-950/20 dark:to-cyan-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-violet-600 dark:text-violet-300" />
              <h1 className="text-xl font-bold tracking-tight text-text-primary">AI confidence center</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              Live tenant intelligence from finance, facilities, inventory, and pipeline — structured as advisory reports.
              {flags.ai_narrative_enabled === false ? (
                <span className="ml-1 font-medium text-amber-800 dark:text-amber-200">
                  Optional generative narrative is off in settings; metrics below are real ERP data.
                </span>
              ) : null}
            </p>
            {widgets?.tenant_name ? (
              <p className="mt-2 text-xs font-medium text-text-primary">
                Tenant: <span className="text-brand-primary">{widgets.tenant_name}</span>
              </p>
            ) : null}
          </div>
          {pending ? (
            <span className="rounded border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-900 dark:text-amber-100">
              Pending external approval
            </span>
          ) : null}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{narrative || "—"}</p>
      </div>

      {widgets ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
            <Gauge className="h-4 w-4 text-violet-500" />
            Key metrics
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-emerald-500/15 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Health score</p>
              <div className="relative mt-2 flex h-24 items-center justify-center">
                <HealthRing score={Number(widgets.health_score ?? 0)} />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-br from-cyan-500/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Debt / asset proxy</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
                {pct(widgets.debt_to_asset_ratio)}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">Lower is generally stronger vs. liquid assets + AR + stock.</p>
            </div>
            <div className="relative rounded-xl border border-border bg-gradient-to-br from-amber-500/10 to-transparent p-4">
              <Wallet className="absolute right-3 top-3 h-8 w-8 text-amber-500/25" />
              <p className="text-xs font-medium uppercase text-text-muted">Liquid funds</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-amber-800 dark:text-amber-200">
                {fmtMoney(widgets.liquid_funds, ccy)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-br from-fuchsia-500/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Inventory (FIFO)</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-fuchsia-800 dark:text-fuchsia-200">
                {fmtMoney(widgets.total_inventory_value, ccy)}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">90d outbound proxy: {fmtMoney(widgets.cogs_outbound_90d, ccy)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium text-text-muted">Receivables</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{fmtMoney(widgets.receivables_open, ccy)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium text-text-muted">Payables</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{fmtMoney(widgets.payables_open, ccy)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium text-text-muted">Active debt</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{fmtMoney(widgets.active_debt_principal, ccy)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium text-text-muted">Open orders</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{widgets.open_orders_count ?? "—"}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-gradient-to-br from-sky-500/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Pipeline</p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <LineChart className="h-4 w-4 text-sky-600" />
                <span>
                  Inquiries <strong>{widgets.inquiries_open ?? 0}</strong> · Quotes{" "}
                  <strong>{widgets.quotations_active ?? 0}</strong>
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-br from-orange-500/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Alerts</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-lg font-bold tabular-nums">{widgets.alerts_total ?? 0}</span>
                {severityChips}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-br from-indigo-500/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Stock movements (30d)</p>
              <div className="mt-2 flex items-center gap-2">
                <Activity className="h-6 w-6 text-indigo-500" />
                <span className="text-2xl font-bold tabular-nums">{widgets.stock_movements_last_30 ?? 0}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-gradient-to-br from-teal-500/10 to-transparent p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Your facilities</p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Building2 className="h-5 w-5 text-teal-600" />
                {widgets.party_linked ? (
                  <span>
                    <strong>{widgets.facilities_count ?? 0}</strong> linked · BTB LCs{" "}
                    <strong>{widgets.btb_lc_count ?? 0}</strong>
                  </span>
                ) : (
                  <span className="text-text-muted">Link financier party for facility roll-up.</span>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {widgets?.party_linked && (widgets.total_sanctioned ?? 0) > 0 ? (
        <div className="rounded-xl border border-indigo-200/50 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <p className="text-xs font-semibold uppercase text-indigo-900 dark:text-indigo-200">Aggregate facility exposure</p>
          <p className="mt-1 text-sm text-text-primary">
            Sanctioned <strong>{fmtMoney(widgets.total_sanctioned, ccy)}</strong> · utilized{" "}
            <strong>{fmtMoney(widgets.total_utilized, ccy)}</strong>
          </p>
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
          <Landmark className="h-4 w-4 text-fuchsia-500" />
          Advisory reports
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map((r) => (
            <article
              key={r.id}
              className={`rounded-xl border border-border border-l-4 p-4 shadow-sm ${ACCENT_STYLES[r.accent] ?? ACCENT_STYLES.sky}`}
            >
              <h3 className="text-sm font-semibold text-text-primary">{r.title}</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-text-muted">
                {(r.bullets ?? []).map((b, i) => (
                  <li key={i} className="leading-relaxed">
                    {b}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {facilities.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Linked facilities</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-surface-subtle text-left text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Sanctioned</th>
                  <th className="px-3 py-2 text-right">Utilized</th>
                  <th className="px-3 py-2 text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr key={f.facility_code} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium">{f.facility_code}</td>
                    <td className="px-3 py-2">{f.facility_type}</td>
                    <td className="px-3 py-2">{f.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(f.sanctioned_amount, f.currency ?? undefined)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(f.utilized_amount, f.currency ?? undefined)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(f.available_amount, f.currency ?? undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface-subtle p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Governance</h2>
          <p className="mt-1 text-xs text-text-muted">
            AI does not post accounting entries. Narratives are advisory; verify against source modules in the ERP.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Report metadata</h2>
          <AiMetaDisplay meta={meta} className="mt-2" />
        </div>
      </div>
    </div>
  );
}
