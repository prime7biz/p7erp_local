import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CreditCard,
  Factory,
  LineChart,
  Package,
  RefreshCw,
  Ship,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import { PortalTenantInfoBanner } from "@/components/external-access/PortalTenantInfoBanner";
import type { PortalOutletContext } from "@/types/portalOutlet";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { PortalMetricCard } from "@/components/external-access/PortalMetricCard";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { GoodsMovementSummaryCard } from "@/components/external-access/GoodsMovementSummaryCard";
import { FinancierGradientMetricCard } from "@/components/external-access/FinancierGradientMetricCard";
import { financierScopeAtLeast } from "@/utils/financierScope";
import { logApiError } from "@/utils/logApiError";

type CreditLineItem = {
  id: number;
  sanctioned_amount: number;
  utilized_amount: number;
  currency?: string | null;
};

type LoanItem = {
  outstanding_principal: number;
  principal: number;
  currency?: string | null;
};

type PartyNextDue = {
  due_date: string;
  amount?: number | null;
  currency?: string | null;
  reference?: string | null;
};

type RecoveryGlance = {
  financed_orders_count?: number;
  at_risk_orders_count?: number;
  total_outstanding_principal?: number | null;
  outstanding_currency?: string | null;
  avg_coverage_ratio?: number | null;
};

type PartyInsights = {
  next_emi?: PartyNextDue | null;
  next_btb_funding?: PartyNextDue | null;
  financed_orders_open?: number | null;
  sewing_planned_qty?: number | null;
  sewing_completed_qty?: number | null;
  sewing_progress_pct?: number | null;
  recovery_glance?: RecoveryGlance | null;
  note?: string | null;
};

function formatMoney(amount: number, currency?: string | null) {
  const cur = currency?.trim() || "";
  const n = amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return cur ? `${cur} ${n}` : n;
}

function formatIsoDate(iso: string) {
  const d = new Date(iso + (iso.includes("T") ? "" : "T12:00:00"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function healthScoreBadgeClass(score: number) {
  if (score > 70) return "bg-emerald-600 text-white";
  if (score >= 40) return "bg-amber-500 text-white";
  return "bg-red-600 text-white";
}

function truncateText(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

function PipelineBars({
  pipeline,
}: {
  pipeline: { inquiries_open: number; inquiries_submitted: number; quotations_open: number; quotations_sent: number };
}) {
  const rows = [
    { key: "inq_open", label: "Inquiries (open)", v: pipeline.inquiries_open, tone: "bg-sky-500" },
    { key: "inq_sub", label: "Inquiries (submitted)", v: pipeline.inquiries_submitted, tone: "bg-cyan-500" },
    { key: "quo_open", label: "Quotations (open)", v: pipeline.quotations_open, tone: "bg-violet-500" },
    { key: "quo_sent", label: "Quotations (sent)", v: pipeline.quotations_sent, tone: "bg-fuchsia-500" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-text-primary">{r.label}</span>
            <span className="tabular-nums text-text-muted">{r.v}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
            <motion.div
              className={`h-full rounded-full ${r.tone}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (r.v / max) * 100)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinancierDashboardPage() {
  const { me } = useOutletContext<PortalOutletContext>();
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const showCredit = financierScopeAtLeast(me.financier_access_scope, "credit_monitoring");
  const [creditLines, setCreditLines] = useState<{ items: CreditLineItem[]; note?: string } | null>(null);
  const [loanPortfolio, setLoanPortfolio] = useState<{ items: LoanItem[] } | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [advSectionErr, setAdvSectionErr] = useState("");
  const [advLoaded, setAdvLoaded] = useState(false);
  const [aiNarrative, setAiNarrative] = useState("");
  const [aiLoaded, setAiLoaded] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const x = await financierPortalApi.dashboard();
      setD(x);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshTick]);

  useEffect(() => {
    if (!showCredit) return;
    let ok = true;
    setAdvSectionErr("");
    setAdvLoaded(false);
    setAiLoaded(false);
    setAiNarrative("");
    (async () => {
      try {
        const [cl, lp, bh, ai] = await Promise.all([
          financierPortalApi.creditLines(),
          financierPortalApi.loanPortfolio(),
          financierPortalApi.businessHealth(),
          financierPortalApi.aiConfidence().catch((e) => {
            logApiError("financier dashboard ai confidence", e);
            return null;
          }),
        ]);
        if (!ok) return;
        const clObj = cl as { items?: CreditLineItem[]; note?: string };
        setCreditLines({ items: Array.isArray(clObj.items) ? clObj.items : [], note: clObj.note });
        const lpObj = lp as { items?: LoanItem[] };
        setLoanPortfolio({ items: Array.isArray(lpObj.items) ? lpObj.items : [] });
        const bhObj = bh as { score?: number };
        setHealthScore(typeof bhObj.score === "number" ? bhObj.score : null);
        if (ai && typeof (ai as { narrative?: unknown }).narrative === "string") {
          setAiNarrative((ai as { narrative: string }).narrative);
        }
      } catch (e) {
        if (ok) {
          setAdvSectionErr(e instanceof Error ? e.message : "Could not load credit or health data.");
          setCreditLines({ items: [] });
          setLoanPortfolio({ items: [] });
          setHealthScore(null);
        }
      } finally {
        if (ok) {
          setAdvLoaded(true);
          setAiLoaded(true);
        }
      }
    })();
    return () => {
      ok = false;
    };
  }, [showCredit, refreshTick]);

  const creditTotals = useMemo(() => {
    if (!creditLines?.items.length) return null;
    const currency = creditLines.items[0]?.currency ?? "";
    let sanctioned = 0;
    let utilized = 0;
    for (const row of creditLines.items) {
      sanctioned += Number(row.sanctioned_amount ?? 0);
      utilized += Number(row.utilized_amount ?? 0);
    }
    return { sanctioned, utilized, available: Math.max(sanctioned - utilized, 0), currency };
  }, [creditLines]);

  const loanTotals = useMemo(() => {
    if (!loanPortfolio?.items.length) return { count: 0, outstanding: 0, currency: "" as string };
    const currency = loanPortfolio.items[0]?.currency ?? "";
    let outstanding = 0;
    for (const row of loanPortfolio.items) {
      outstanding += Number(row.outstanding_principal ?? 0);
    }
    return { count: loanPortfolio.items.length, outstanding, currency };
  }, [loanPortfolio]);

  const partyInsights = (d?.party_insights ?? null) as PartyInsights | null;

  const pipeline = d?.pipeline as Record<string, number> | undefined;
  const goods = d?.goods as Record<string, number> | undefined;

  if (err) return <PortalErrorState message={err} />;
  if (loading && !d) return <p className="text-sm text-text-muted">Loading…</p>;
  if (!d) return <p className="text-sm text-text-muted">Loading…</p>;

  const greeting = me.full_name?.trim() || "Financier";
  const aiTeaser = aiNarrative ? truncateText(aiNarrative, 420) : "";

  return (
    <div className="space-y-8">
      <PortalTenantInfoBanner me={me} />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-indigo-200/50 bg-gradient-to-br from-indigo-600/90 via-violet-600/85 to-fuchsia-600/80 p-6 text-white shadow-lg dark:border-indigo-900/50 dark:from-indigo-950 dark:via-violet-950 dark:to-fuchsia-950"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-100/90">Live overview</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {greeting}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-indigo-50/95">
              {me.tenant_name} — pipeline, shipments, inventory movement, and (when linked) EMI and BTB funding dates in one
              place. Use refresh to pull the latest numbers.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ...(showCredit
                  ? [
                      { to: "/portal/financier/contracts", label: "Contracts" },
                      { to: "/portal/financier/recovery-outlook", label: "Recovery" },
                    ]
                  : []),
                { to: "/portal/financier/order-book", label: "Order book" },
                { to: "/portal/financier/pipeline", label: "Pipeline detail" },
                { to: "/portal/financier/production", label: "Production" },
                { to: "/portal/financier/alerts", label: "Alerts" },
                ...(showCredit ? [{ to: "/portal/financier/ai-confidence", label: "AI insights" }] : []),
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  {l.label}
                  <ArrowRight className="h-3 w-3 opacity-80" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRefreshTick((n) => n + 1)}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25 lg:self-auto"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh data
          </button>
        </div>
      </motion.section>

      {showCredit && aiTeaser ? (
        <section className="rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 p-5 shadow-sm dark:border-violet-900/50">
          <div className="flex flex-wrap items-center gap-2 text-violet-800 dark:text-violet-200">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
            <h2 className="text-sm font-bold uppercase tracking-wide">AI narrative (read-only)</h2>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{aiTeaser}</p>
          <Link
            to="/portal/financier/ai-confidence"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
          >
            Open full AI confidence center
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      ) : showCredit && aiLoaded && !aiTeaser ? (
        <p className="text-xs text-text-muted">
          Optional AI narrative is off or empty — metrics below are still live ERP data. Open{" "}
          <Link to="/portal/financier/ai-confidence" className="font-medium text-brand-primary hover:underline">
            AI confidence
          </Link>{" "}
          for structured reports.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinancierGradientMetricCard
          title="All orders (tenant)"
          value={Number(d.active_order_lines ?? 0).toLocaleString()}
          subtitle="Total order records on file."
          icon={Package}
          shellClass="from-sky-500/15 to-transparent border-sky-300/40 dark:border-sky-800/50"
          iconWrapClass="bg-sky-500/20 text-sky-700 dark:text-sky-200"
          href="/portal/financier/order-book"
          delay={0.02}
        />
        <FinancierGradientMetricCard
          title="Confirmed orders"
          value={Number(d.confirmed_style_orders ?? 0).toLocaleString()}
          subtitle="Excludes draft / cancelled."
          icon={LineChart}
          shellClass="from-emerald-500/15 to-transparent border-emerald-300/40 dark:border-emerald-800/50"
          iconWrapClass="bg-emerald-500/20 text-emerald-700 dark:text-emerald-200"
          href="/portal/financier/order-book"
          delay={0.06}
        />
        <FinancierGradientMetricCard
          title="Shipments due (this month)"
          value={Number(d.shipments_due_this_month ?? 0).toLocaleString()}
          subtitle="By ETD window."
          icon={Ship}
          shellClass="from-amber-500/15 to-transparent border-amber-300/40 dark:border-amber-800/50"
          iconWrapClass="bg-amber-500/20 text-amber-800 dark:text-amber-200"
          href="/portal/financier/goods-movement"
          delay={0.1}
        />
        <FinancierGradientMetricCard
          title="Open alerts"
          value={Number(d.alerts_count ?? 0).toLocaleString()}
          subtitle="Operational & credit signals."
          icon={AlertTriangle}
          shellClass="from-rose-500/15 to-transparent border-rose-300/40 dark:border-rose-800/50"
          iconWrapClass="bg-rose-500/20 text-rose-700 dark:text-rose-200"
          href="/portal/financier/alerts"
          delay={0.14}
        />
        <FinancierGradientMetricCard
          title="Projection (90 days)"
          value={
            typeof d.projection_next_90_units === "number" ? d.projection_next_90_units.toLocaleString() : "—"
          }
          subtitle="Planned units — next 3 months."
          icon={BarChart3}
          shellClass="from-violet-500/15 to-transparent border-violet-300/40 dark:border-violet-800/50"
          iconWrapClass="bg-violet-500/20 text-violet-700 dark:text-violet-200"
          href="/portal/financier/projections"
          delay={0.18}
        />
        <FinancierGradientMetricCard
          title="BTB maturities (90d)"
          value={
            typeof d.btb_maturities_upcoming_90d === "number" ? d.btb_maturities_upcoming_90d.toLocaleString() : "—"
          }
          subtitle="When financial summary is enabled for the tenant."
          icon={CalendarClock}
          shellClass="from-cyan-500/15 to-transparent border-cyan-300/40 dark:border-cyan-800/50"
          iconWrapClass="bg-cyan-500/20 text-cyan-800 dark:text-cyan-200"
          href="/portal/financier/btb-liabilities"
          delay={0.22}
        />
        {partyInsights?.financed_orders_open != null ? (
          <FinancierGradientMetricCard
            title="Orders in hand (financed)"
            value={partyInsights.financed_orders_open.toLocaleString()}
            subtitle="Linked to your party, not yet shipped."
            icon={Factory}
            shellClass="from-fuchsia-500/15 to-transparent border-fuchsia-300/40 dark:border-fuchsia-800/50"
            iconWrapClass="bg-fuchsia-500/20 text-fuchsia-800 dark:text-fuchsia-200"
            href="/portal/financier/production"
            delay={0.26}
          />
        ) : null}
        {partyInsights?.sewing_progress_pct != null ? (
          <FinancierGradientMetricCard
            title="Sewing load (financed)"
            value={`${partyInsights.sewing_progress_pct}%`}
            subtitle={
              partyInsights.sewing_completed_qty != null && partyInsights.sewing_planned_qty != null
                ? `${partyInsights.sewing_completed_qty.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${partyInsights.sewing_planned_qty.toLocaleString(undefined, { maximumFractionDigits: 0 })} pcs on line plans`
                : "Completed vs planned on sewing line configs."
            }
            icon={Activity}
            shellClass="from-orange-500/15 to-transparent border-orange-300/40 dark:border-orange-800/50"
            iconWrapClass="bg-orange-500/20 text-orange-800 dark:text-orange-200"
            href="/portal/financier/production"
            delay={0.3}
          />
        ) : null}
      </div>

      {partyInsights?.recovery_glance && (partyInsights.recovery_glance.financed_orders_count ?? 0) > 0 ? (
        <section className="rounded-2xl border border-rose-200/60 bg-gradient-to-r from-rose-500/5 via-orange-500/5 to-transparent p-5 dark:border-rose-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-primary">Recovery at a glance</h2>
            <Link to="/portal/financier/recovery-outlook" className="text-xs font-semibold text-brand-primary hover:underline">
              Full recovery outlook →
            </Link>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <dt className="text-text-muted">Financed orders</dt>
              <dd className="font-semibold tabular-nums">{partyInsights.recovery_glance.financed_orders_count}</dd>
            </div>
            <div>
              <dt className="text-text-muted">At-risk / watch</dt>
              <dd className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {partyInsights.recovery_glance.at_risk_orders_count ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Total outstanding</dt>
              <dd className="font-semibold tabular-nums">
                {partyInsights.recovery_glance.total_outstanding_principal != null
                  ? formatMoney(
                      partyInsights.recovery_glance.total_outstanding_principal,
                      partyInsights.recovery_glance.outstanding_currency,
                    )
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Avg coverage ratio</dt>
              <dd className="font-semibold tabular-nums">
                {partyInsights.recovery_glance.avg_coverage_ratio != null
                  ? partyInsights.recovery_glance.avg_coverage_ratio.toFixed(2)
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {partyInsights &&
      (partyInsights.next_emi ||
        partyInsights.next_btb_funding ||
        partyInsights.note ||
        partyInsights.sewing_progress_pct != null) ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent p-5 dark:border-teal-900/40">
            <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200">
              <CreditCard className="h-5 w-5" aria-hidden />
              <h2 className="text-sm font-bold uppercase tracking-wide">Next EMI (facility schedule)</h2>
            </div>
            {partyInsights.next_emi ? (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Due</dt>
                  <dd className="font-semibold text-text-primary">{formatIsoDate(partyInsights.next_emi.due_date)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Amount</dt>
                  <dd className="font-semibold text-text-primary">
                    {partyInsights.next_emi.amount != null
                      ? formatMoney(partyInsights.next_emi.amount, partyInsights.next_emi.currency)
                      : "—"}
                  </dd>
                </div>
                {partyInsights.next_emi.reference ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-muted">Utilization</dt>
                    <dd className="font-medium text-brand-primary">{partyInsights.next_emi.reference}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-text-muted">No upcoming repayment line in scope.</p>
            )}
            <Link
              to="/portal/financier/loan-portfolio"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
            >
              Loan portfolio &amp; schedules
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-transparent p-5 dark:border-indigo-900/40">
            <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
              <Wallet className="h-5 w-5" aria-hidden />
              <h2 className="text-sm font-bold uppercase tracking-wide">Next BTB funding / tranche</h2>
            </div>
            {partyInsights.next_btb_funding ? (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Maturity</dt>
                  <dd className="font-semibold text-text-primary">
                    {formatIsoDate(partyInsights.next_btb_funding.due_date)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Amount</dt>
                  <dd className="font-semibold text-text-primary">
                    {partyInsights.next_btb_funding.amount != null
                      ? formatMoney(partyInsights.next_btb_funding.amount, partyInsights.next_btb_funding.currency)
                      : "—"}
                  </dd>
                </div>
                {partyInsights.next_btb_funding.reference ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-muted">LC reference</dt>
                    <dd className="font-medium text-brand-primary">{partyInsights.next_btb_funding.reference}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-text-muted">No open BTB tranche in your linked LCs.</p>
            )}
            <Link
              to="/portal/financier/btb-liabilities"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
            >
              BTB liabilities
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {partyInsights.note ? (
            <p className="text-sm text-text-muted lg:col-span-2">{partyInsights.note}</p>
          ) : null}
          {partyInsights.sewing_progress_pct != null && partyInsights.sewing_planned_qty ? (
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold uppercase text-text-muted">Financed orders — sewing progress</p>
              <div className="mt-2 h-4 overflow-hidden rounded-full bg-surface-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, partyInsights.sewing_progress_pct)}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                />
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {partyInsights.sewing_progress_pct}% of planned sewing quantity under financed orders (line configs).
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {pipeline ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-violet-500" aria-hidden />
                <h2 className="text-sm font-semibold text-text-primary">Commercial pipeline</h2>
              </div>
              <Link to="/portal/financier/pipeline" className="text-xs font-medium text-brand-primary hover:underline">
                Details →
              </Link>
            </div>
            <PipelineBars
              pipeline={{
                inquiries_open: Number(pipeline.inquiries_open ?? 0),
                inquiries_submitted: Number(pipeline.inquiries_submitted ?? 0),
                quotations_open: Number(pipeline.quotations_open ?? 0),
                quotations_sent: Number(pipeline.quotations_sent ?? 0),
              }}
            />
          </motion.div>
          {goods ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-gradient-to-br from-lime-500/5 to-transparent p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-lime-600 dark:text-lime-400" aria-hidden />
                  <h2 className="text-sm font-semibold text-text-primary">Goods &amp; stock movement</h2>
                </div>
                <Link
                  to="/portal/financier/goods-movement"
                  className="text-xs font-medium text-brand-primary hover:underline"
                >
                  Ledger →
                </Link>
              </div>
              <GoodsMovementSummaryCard
                inCount={Number(goods.movements_in_count ?? 0)}
                outCount={Number(goods.movements_out_count ?? 0)}
                adjust={Number(goods.movements_adjust_count ?? 0)}
                recent={Number(goods.last_30_days_total ?? 0)}
              />
            </motion.div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-muted">
              Goods movement summary not available.
            </div>
          )}
        </div>
      ) : null}

      {showCredit ? (
        <div className="space-y-6">
          {advSectionErr ? (
            <p className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-text-primary">
              {advSectionErr}
            </p>
          ) : null}
          <section className="rounded-2xl border border-border bg-gradient-to-br from-slate-500/5 to-transparent p-5">
            <h2 className="text-sm font-semibold text-text-primary">Your facilities (credit lines)</h2>
            {creditLines == null && !advSectionErr ? (
              <p className="mt-2 text-sm text-text-muted">Loading credit lines…</p>
            ) : null}
            {creditLines?.note ? <p className="mt-2 text-sm text-text-muted">{creditLines.note}</p> : null}
            {creditTotals ? (
              <div className={`mt-3 ${listPageKpiGridClass}`}>
                <PortalMetricCard label="Total sanctioned" value={formatMoney(creditTotals.sanctioned, creditTotals.currency)} />
                <PortalMetricCard label="Total utilized" value={formatMoney(creditTotals.utilized, creditTotals.currency)} />
                <PortalMetricCard label="Available headroom" value={formatMoney(creditTotals.available, creditTotals.currency)} />
              </div>
            ) : creditLines && creditLines.items.length === 0 && !creditLines.note ? (
              <p className="mt-2 text-sm text-text-muted">No linked facilities yet.</p>
            ) : null}
            <p className="mt-3 text-xs">
              <Link to="/portal/financier/credit-lines" className="font-medium text-brand-primary hover:underline">
                View credit lines →
              </Link>
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-gradient-to-br from-blue-500/5 to-transparent p-5">
            <h2 className="text-sm font-semibold text-text-primary">Loan overview</h2>
            {loanPortfolio == null && !advSectionErr ? (
              <p className="mt-2 text-sm text-text-muted">Loading portfolio…</p>
            ) : null}
            {loanTotals.count > 0 ? (
              <div className={`mt-3 ${listPageKpiGridClass}`}>
                <PortalMetricCard label="Active utilizations" value={loanTotals.count} />
                <PortalMetricCard
                  label="Total outstanding principal"
                  value={formatMoney(loanTotals.outstanding, loanTotals.currency)}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-text-muted">No utilizations linked to your financier party.</p>
            )}
            <p className="mt-3 text-xs">
              <Link to="/portal/financier/loan-portfolio" className="font-medium text-brand-primary hover:underline">
                Open loan portfolio →
              </Link>
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
            <h2 className="text-sm font-semibold text-text-primary">Business health</h2>
            <p className="mt-1 text-xs text-text-muted">Tenant-wide composite score (indicative).</p>
            {!advLoaded && !advSectionErr ? (
              <p className="mt-2 text-sm text-text-muted">Loading health score…</p>
            ) : null}
            {healthScore != null ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex rounded-full px-4 py-1.5 text-lg font-bold tabular-nums ${healthScoreBadgeClass(healthScore)}`}
                >
                  {healthScore}
                </span>
                <span className="text-sm text-text-muted">/ 100</span>
                <Link
                  to="/portal/financier/business-health"
                  className="ml-auto text-sm font-medium text-brand-primary hover:underline"
                >
                  Full breakdown →
                </Link>
              </div>
            ) : advLoaded && !advSectionErr ? (
              <p className="mt-2 text-sm text-text-muted">Score not available.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
