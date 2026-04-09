import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { PortalTenantInfoBanner } from "@/components/external-access/PortalTenantInfoBanner";
import type { PortalOutletContext } from "@/types/portalOutlet";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { PortalMetricCard } from "@/components/external-access/PortalMetricCard";
import { FinancierConfidenceSummaryCard } from "@/components/external-access/FinancierConfidenceSummaryCard";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { GoodsMovementSummaryCard } from "@/components/external-access/GoodsMovementSummaryCard";
import { financierScopeAtLeast } from "@/utils/financierScope";

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

function formatMoney(amount: number, currency?: string | null) {
  const cur = currency?.trim() || "";
  const n = amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return cur ? `${cur} ${n}` : n;
}

function healthScoreBadgeClass(score: number) {
  if (score > 70) return "bg-emerald-600 text-white";
  if (score >= 40) return "bg-amber-500 text-white";
  return "bg-red-600 text-white";
}

export function FinancierDashboardPage() {
  const { me } = useOutletContext<PortalOutletContext>();
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  const showCredit = financierScopeAtLeast(me.financier_access_scope, "credit_monitoring");
  const [creditLines, setCreditLines] = useState<{ items: CreditLineItem[]; note?: string } | null>(null);
  const [loanPortfolio, setLoanPortfolio] = useState<{ items: LoanItem[] } | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [advSectionErr, setAdvSectionErr] = useState("");
  const [advLoaded, setAdvLoaded] = useState(false);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const x = await financierPortalApi.dashboard();
        if (ok) setD(x);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  useEffect(() => {
    if (!showCredit) return;
    let ok = true;
    setAdvSectionErr("");
    setAdvLoaded(false);
    (async () => {
      try {
        const [cl, lp, bh] = await Promise.all([
          financierPortalApi.creditLines(),
          financierPortalApi.loanPortfolio(),
          financierPortalApi.businessHealth(),
        ]);
        if (!ok) return;
        const clObj = cl as { items?: CreditLineItem[]; note?: string };
        setCreditLines({ items: Array.isArray(clObj.items) ? clObj.items : [], note: clObj.note });
        const lpObj = lp as { items?: LoanItem[] };
        setLoanPortfolio({ items: Array.isArray(lpObj.items) ? lpObj.items : [] });
        const bhObj = bh as { score?: number };
        setHealthScore(typeof bhObj.score === "number" ? bhObj.score : null);
      } catch (e) {
        if (ok) {
          setAdvSectionErr(e instanceof Error ? e.message : "Could not load credit or health data.");
          setCreditLines({ items: [] });
          setLoanPortfolio({ items: [] });
          setHealthScore(null);
        }
      } finally {
        if (ok) setAdvLoaded(true);
      }
    })();
    return () => {
      ok = false;
    };
  }, [showCredit]);

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

  if (err) return <PortalErrorState message={err} />;
  if (!d) return <p className="text-sm text-text-muted">Loading…</p>;

  const pipeline = d.pipeline as Record<string, number> | undefined;
  const goods = d.goods as Record<string, number> | undefined;

  return (
    <div className="space-y-8">
      <PortalTenantInfoBanner me={me} />
      <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
      <FinancierConfidenceSummaryCard>
        <p>
          Operational and commercial signals below are aggregated for transparency. No line-level costing or supplier
          pricing is exposed.
        </p>
      </FinancierConfidenceSummaryCard>
      <div className={listPageKpiGridClass}>
        <PortalMetricCard label="Order lines (all)" value={Number(d.active_order_lines ?? 0)} />
        <PortalMetricCard label="Confirmed orders" value={Number(d.confirmed_style_orders ?? 0)} />
        <PortalMetricCard label="Shipments due (month)" value={Number(d.shipments_due_this_month ?? 0)} />
        <PortalMetricCard label="Open alerts" value={Number(d.alerts_count ?? 0)} />
        <PortalMetricCard
          label="Projection (3 mo units)"
          value={typeof d.projection_next_90_units === "number" ? d.projection_next_90_units : "—"}
        />
      </div>

      {showCredit ? (
        <div className="space-y-6">
          {advSectionErr ? (
            <p className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-text-primary">
              {advSectionErr}
            </p>
          ) : null}
          <section className="rounded-xl border border-border p-4">
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
              <Link to="/portal/financier/credit-lines" className="text-brand-primary hover:underline">
                View credit lines →
              </Link>
            </p>
          </section>

          <section className="rounded-xl border border-border p-4">
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
              <Link to="/portal/financier/loan-portfolio" className="text-brand-primary hover:underline">
                Open loan portfolio →
              </Link>
            </p>
          </section>

          <section className="rounded-xl border border-border p-4">
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

      {pipeline ? (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-text-primary mb-2">Pipeline</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-text-muted sm:grid-cols-4">
            <span>Inquiries open: {pipeline.inquiries_open}</span>
            <span>Inquiries submitted: {pipeline.inquiries_submitted}</span>
            <span>Quotations open: {pipeline.quotations_open}</span>
            <span>Quotations sent: {pipeline.quotations_sent}</span>
          </div>
        </div>
      ) : null}
      {goods ? (
        <GoodsMovementSummaryCard
          inCount={Number(goods.movements_in_count ?? 0)}
          outCount={Number(goods.movements_out_count ?? 0)}
          adjust={Number(goods.movements_adjust_count ?? 0)}
          recent={Number(goods.last_30_days_total ?? 0)}
        />
      ) : null}
    </div>
  );
}
