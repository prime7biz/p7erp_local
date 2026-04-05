import { Suspense, useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { Button } from "@/components/ui/button";
import { PortalPageSkeleton } from "@/components/external-access/PortalSkeletons";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type FinancierNavItem = { to: string; label: string; end?: boolean };

const navAll: FinancierNavItem[] = [
  { to: "/portal/financier", label: "Dashboard", end: true },
  { to: "/portal/financier/order-book", label: "Order book" },
  { to: "/portal/financier/pipeline", label: "Pipeline" },
  { to: "/portal/financier/goods-movement", label: "Goods movement" },
  { to: "/portal/financier/financial-summary", label: "Financial summary" },
  { to: "/portal/financier/projections", label: "Projections" },
  { to: "/portal/financier/alerts", label: "Alerts" },
];

export function FinancierPortalLayout() {
  const navigate = useNavigate();
  const { me, loading, error, logout, refetch } = useExternalAuth("financier");

  const nav = useMemo(() => {
    const flags = me?.feature_flags as Record<string, boolean> | undefined;
    const financialOn = flags?.financier_financial_summary_enabled === true;
    const projectionsOn = flags?.financier_projection_enabled === true;
    /* While profile loads, keep links visible; hide only once we know flags are off. */
    const hideFinancial = me != null && !financialOn;
    const hideProjections = me != null && !projectionsOn;
    return navAll.filter((item) => {
      if (item.to === "/portal/financier/financial-summary") return !hideFinancial;
      if (item.to === "/portal/financier/projections") return !hideProjections;
      return true;
    });
  }, [me]);

  async function handleLogout() {
    await logout();
    navigate("/portal/financier/login", { replace: true });
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
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
