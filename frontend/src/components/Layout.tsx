import { Suspense, useState, useMemo, useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getActiveAnnouncements, getToken, getTenantId } from "@/api/client";
import { menuSections } from "@/app/sidebarConfig";
import { useProductionOptionalUnits } from "@/hooks/useProductionOptionalUnits";
import { AppBottomNav } from "@/components/navigation/AppBottomNav";
import { flattenMenuRoutes } from "@/components/shell/flattenMenuRoutes";
import { hrTabPaletteRoutes } from "@/components/hr/kit/hrHubs";
import { ShellTopHeader } from "@/components/shell/ShellTopHeader";
import { ShellBreadcrumbs } from "@/components/shell/ShellBreadcrumbs";
import { Sidebar } from "@/components/shell/Sidebar";
import { AppFooter } from "@/components/shell/AppFooter";
import { QuickCreateFab } from "@/components/shell/QuickCreateFab";
import { filterVisibleMenuSections, isMenuPermissionAllowed } from "@/components/shell/sidebarNavUtils";
import { isFinanceHubsV2Enabled } from "@/components/finance/hubs/financeHubs";
import { financeTabPaletteRoutes } from "@/components/finance/hubs/financeNavigation";
import { DemoModeBanner } from "@/components/shell/DemoModeBanner";
import { logApiError } from "@/utils/logApiError";
import { isMobileUiV2Enabled } from "@/lib/mobileUi";

export function Layout() {
  const { me, loading, error, logout, refetch, hasPermission } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { enabledOptionalUnits } = useProductionOptionalUnits(me?.tenant_type);
  const [announcements, setAnnouncements] = useState<{ id: number; title: string; content: string; type: string }[]>([]);

  useEffect(() => {
    // Skip while an error is shown, otherwise a failing /me would be retried in a tight loop.
    if (getToken() && getTenantId() && !me && !loading && !error) refetch();
  }, [me, loading, error, refetch]);

  useEffect(() => {
    const saved = localStorage.getItem("p7_sidebar_collapsed");
    if (saved) setIsCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("p7_sidebar_collapsed", isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  // Phone touch sizes in index.css apply only while this tenant has mobile_ui_v2 on.
  const mobileUiV2 = isMobileUiV2Enabled(me?.feature_flags);
  useEffect(() => {
    document.documentElement.classList.toggle("p7-mobile-v2", mobileUiV2);
    return () => document.documentElement.classList.remove("p7-mobile-v2");
  }, [mobileUiV2]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    getActiveAnnouncements()
      .then((r) => {
        if (!cancelled) setAnnouncements(r.items ?? []);
      })
      .catch((e) => {
        logApiError("Layout.getActiveAnnouncements", e);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const paletteRoutes = useMemo(() => {
    if (!me) return [];
    const filtered = filterVisibleMenuSections(menuSections, {
      tenantType: me.tenant_type,
      enabledOptionalProductionUnits: enabledOptionalUnits,
      featureFlags: me.feature_flags,
      hasPermission,
    });
    const rows = flattenMenuRoutes(filtered);
    // HR pages live as tabs inside hubs; list each tab so it stays searchable in the palette.
    const withHr = filtered.some((s) => s.section === "HR") ? [...rows, ...hrTabPaletteRoutes(me.feature_flags)] : rows;
    // Same for Finance when the hubs are switched on (finance_hubs_v2).
    if (!isFinanceHubsV2Enabled(me.feature_flags) || !filtered.some((s) => s.section === "Finance")) return withHr;
    const canAccess = (key: string) => isMenuPermissionAllowed(key, me.feature_flags, hasPermission);
    return [...withHr, ...financeTabPaletteRoutes(me.feature_flags, canAccess)];
  }, [me, enabledOptionalUnits, hasPermission]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) {
    return (
      <div className="p-6">
        <p className="text-status-danger">{error}</p>
        {getToken() ? (
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Retry
          </button>
        ) : (
          <a href="/login" className="mt-3 inline-block text-sm text-primary underline">
            Go to login
          </a>
        )}
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;

  const displayName = me.first_name
    ? `${me.first_name} ${me.last_name ?? ""}`.trim()
    : (me.username?.trim() || me.email);

  const role = (me.role_name || "").toLowerCase();
  const showHealthDetails = ["admin", "owner", "manager"].includes(role);
  const appShellV2 = me.feature_flags?.app_shell_v2 === true;

  return (
    <div className="erp-app-shell flex min-h-[100dvh] bg-surface-base lg:h-screen lg:overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-[100] -translate-y-[220%] rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow-md outline-none ring-2 ring-brand-primary/40 transition focus:translate-y-0"
      >
        Skip to content
      </a>
      <div className="no-print hidden lg:flex">
        <Sidebar
          tenantType={me.tenant_type}
          tenantName={me.tenant_name}
          companyCode={me.company_code}
          userName={displayName}
          userId={me.user_id}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
          enabledOptionalProductionUnits={enabledOptionalUnits}
          featureFlags={me.feature_flags}
          hasPermission={hasPermission}
          compact={appShellV2}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellTopHeader
          me={me}
          displayName={displayName}
          onLogout={logout}
          paletteRoutes={paletteRoutes}
        />
        <ShellBreadcrumbs routes={paletteRoutes} />
        <main
          id="main-content"
          tabIndex={-1}
          className="erp-main-content min-w-0 flex-1 bg-surface-base p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:overflow-y-auto lg:p-5 lg:pb-4 focus:outline-none"
        >
          <DemoModeBanner />
          {announcements.length > 0 && (
            <div className="no-print mb-3 space-y-2" aria-live="polite">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  role="status"
                  className={
                    a.type === "warning" || a.type === "maintenance"
                      ? "rounded-lg border border-status-warning/40 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground"
                      : "rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-2 text-sm text-status-info-foreground"
                  }
                >
                  <div className="font-semibold">{a.title}</div>
                  <div className="mt-1 whitespace-pre-wrap text-xs opacity-90">{a.content}</div>
                </div>
              ))}
            </div>
          )}
          <Suspense
            fallback={
              <div className="flex min-h-[30vh] items-center justify-center" role="status" aria-label="Loading page">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-brand-primary" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <div className="no-print hidden lg:block">
          <AppFooter showHealthDetails={showHealthDetails} />
        </div>
      </div>
      <QuickCreateFab tenantType={me.tenant_type} roleName={me.role_name} />
      <AppBottomNav
        tenantType={me.tenant_type}
        enabledOptionalProductionUnits={enabledOptionalUnits}
        featureFlags={me.feature_flags}
        hasPermission={hasPermission}
      />
    </div>
  );
}
