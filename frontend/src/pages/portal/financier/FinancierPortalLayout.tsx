import { Suspense, useMemo } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { Button } from "@/components/ui/button";
import { PortalPageSkeleton } from "@/components/external-access/PortalSkeletons";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { financierScopeAtLeast, type FinancierScopeKey } from "@/utils/financierScope";
import { redirectToUnifiedLogin } from "@/utils/portalAuthRedirect";

type FinancierNavItem = { to: string; label: string; end?: boolean; minScope: FinancierScopeKey };

const navAll: FinancierNavItem[] = [
  { to: "/portal/financier", label: "Dashboard", end: true, minScope: "tenant_summary" },
  { to: "/portal/financier/contracts", label: "Contracts", minScope: "credit_monitoring" },
  { to: "/portal/financier/order-book", label: "Order book", minScope: "orders_and_pipeline" },
  { to: "/portal/financier/pipeline", label: "Pipeline", minScope: "orders_and_pipeline" },
  { to: "/portal/financier/goods-movement", label: "Goods movement", minScope: "orders_and_pipeline" },
  { to: "/portal/financier/financial-summary", label: "Financial summary", minScope: "financial_summary" },
  { to: "/portal/financier/projections", label: "Projections", minScope: "financial_summary" },
  { to: "/portal/financier/credit-lines", label: "Credit lines", minScope: "credit_monitoring" },
  { to: "/portal/financier/loan-portfolio", label: "Portfolio", minScope: "credit_monitoring" },
  { to: "/portal/financier/order-finance", label: "Order finance", minScope: "credit_monitoring" },
  { to: "/portal/financier/recovery-outlook", label: "Recovery outlook", minScope: "credit_monitoring" },
  { to: "/portal/financier/procurement", label: "Procurement", minScope: "credit_monitoring" },
  { to: "/portal/financier/raw-materials", label: "Raw materials", minScope: "credit_monitoring" },
  { to: "/portal/financier/stock-collateral", label: "Stock", minScope: "credit_monitoring" },
  { to: "/portal/financier/btb-liabilities", label: "BTB liabilities", minScope: "credit_monitoring" },
  { to: "/portal/financier/inventory", label: "Inventory", minScope: "credit_monitoring" },
  { to: "/portal/financier/production", label: "Production", minScope: "credit_monitoring" },
  { to: "/portal/financier/traceability", label: "Traceability", minScope: "credit_monitoring" },
  { to: "/portal/financier/financial-visibility", label: "Export finance", minScope: "credit_monitoring" },
  { to: "/portal/financier/business-health", label: "Health", minScope: "credit_monitoring" },
  { to: "/portal/financier/ai-confidence", label: "AI confidence", minScope: "credit_monitoring" },
  { to: "/portal/financier/snapshots", label: "Snapshots", minScope: "full_financier_portal" },
  { to: "/portal/financier/reports", label: "Reports", minScope: "full_financier_portal" },
  { to: "/portal/financier/alerts", label: "Alerts", minScope: "tenant_summary" },
  { to: "/portal/financier/risk-panel", label: "Risk panel", minScope: "tenant_summary" },
];

export function FinancierPortalLayout() {
  const { me, loading, error, logout, refetch } = useExternalAuth("financier");

  const nav = useMemo(() => {
    const flags = me?.feature_flags as Record<string, boolean> | undefined;
    const financialOn = flags?.financier_financial_summary_enabled === true;
    const projectionsOn = flags?.financier_projection_enabled === true;
    const scope = me?.financier_access_scope ?? null;

    return navAll.filter((item) => {
      if (!financierScopeAtLeast(scope, item.minScope)) return false;
      if (item.to === "/portal/financier/financial-summary") return financialOn || me == null;
      if (item.to === "/portal/financier/projections") return projectionsOn || me == null;
      return true;
    });
  }, [me]);

  async function handleLogout() {
    await logout();
    redirectToUnifiedLogin("financier");
  }

  if (loading && !me) return <PortalPageSkeleton />;
  if (error && !me) return <PortalErrorState message={error} onRetry={() => void refetch()} />;

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">Financier confidence center</p>
            <p className="text-xs text-text-muted">{me?.tenant_name}</p>
            {me?.financier_access_scope ? (
              <p className="text-[10px] text-text-muted">Scope: {me.financier_access_scope}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted hidden sm:inline">{me?.full_name}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl border-t border-border px-4 py-2 flex flex-wrap gap-2">
          {nav.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={Boolean(end)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-xs font-medium ${isActive ? "bg-brand-primary/10 text-brand-primary" : "text-text-muted hover:bg-surface-base"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 erp-main-content">
        <Suspense fallback={<PortalPageSkeleton />}>
          <Outlet context={{ me: me! }} />
        </Suspense>
      </main>
    </div>
  );
}
