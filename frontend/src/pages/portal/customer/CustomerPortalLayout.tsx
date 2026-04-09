import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { Button } from "@/components/ui/button";
import { PortalPageSkeleton } from "@/components/external-access/PortalSkeletons";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { redirectToUnifiedLogin } from "@/utils/portalAuthRedirect";

const nav = [
  { to: "/portal/customer", label: "Dashboard", end: true },
  { to: "/portal/customer/orders", label: "Orders" },
  { to: "/portal/customer/approvals", label: "Approvals" },
  { to: "/portal/customer/shipments", label: "Shipments" },
  { to: "/portal/customer/notes", label: "Notes" },
];

export function CustomerPortalLayout() {
  const { me, loading, error, logout, refetch } = useExternalAuth("customer");

  async function handleLogout() {
    await logout();
    redirectToUnifiedLogin("customer");
  }

  if (loading && !me) return <PortalPageSkeleton />;
  if (error && !me) return <PortalErrorState message={error} onRetry={() => void refetch()} />;

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/images/logo.svg" alt="" className="h-8 w-auto" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Customer portal</p>
              <p className="text-xs text-text-muted">{me?.tenant_name}</p>
            </div>
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
              end={end}
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
      <footer className="border-t border-border py-4 text-center text-xs text-text-muted">
        <Link to="/" className="hover:text-brand-primary">
          Prime7 ERP
        </Link>
      </footer>
    </div>
  );
}
