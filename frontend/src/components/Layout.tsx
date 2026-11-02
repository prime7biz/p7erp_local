import { useState, useMemo, useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getActiveAnnouncements, getToken, getTenantId } from "@/api/client";
import {
  isNavItemVisibleForTenant,
  menuSections,
} from "@/app/sidebarConfig";
import { useProductionOptionalUnits } from "@/hooks/useProductionOptionalUnits";
import { AppBottomNav } from "@/components/navigation/AppBottomNav";
import { getRbacMode } from "@/components/auth/rbacMode";
import { flattenMenuRoutes } from "@/components/shell/flattenMenuRoutes";
import { ShellTopHeader } from "@/components/shell/ShellTopHeader";
import { ShellBreadcrumbs } from "@/components/shell/ShellBreadcrumbs";
import { Sidebar } from "@/components/shell/Sidebar";
import { AppFooter } from "@/components/shell/AppFooter";
import { QuickCreateFab } from "@/components/shell/QuickCreateFab";
import { isVisible, sectionPermissionKey } from "@/components/shell/sidebarNavUtils";
import { DemoModeBanner } from "@/components/shell/DemoModeBanner";
import { logApiError } from "@/utils/logApiError";

export function Layout() {
  const { me, loading, error, logout, refetch, hasPermission } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { enabledOptionalUnits } = useProductionOptionalUnits(me?.tenant_type);
  const [announcements, setAnnouncements] = useState<{ id: number; title: string; content: string; type: string }[]>([]);

  useEffect(() => {
    if (getToken() && getTenantId() && !me && !loading) refetch();
  }, [me, loading, refetch]);

  useEffect(() => {
    const saved = localStorage.getItem("p7_sidebar_collapsed");
    if (saved) setIsCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("p7_sidebar_collapsed", isCollapsed ? "1" : "0");
  }, [isCollapsed]);

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
    const rbacMode = getRbacMode(me.feature_flags);
    const filtered = menuSections
      .filter((s) => isVisible(me.tenant_type, s.visibleFor))
      .filter((s) => {
        if (rbacMode !== "enforce") return true;
        const permissionKey = sectionPermissionKey(s.section);
        if (!permissionKey) return true;
        return hasPermission(permissionKey);
      })
      .map((s) => {
        if (s.subsections && s.subsections.length > 0) {
          const subsections = s.subsections
            .map((sub) => ({
              ...sub,
              items: sub.items.filter((i) =>
                isNavItemVisibleForTenant(i, me.tenant_type, enabledOptionalUnits, me.feature_flags),
              ),
            }))
            .filter((sub) => sub.items.length > 0);
          return { ...s, items: [], subsections };
        }
        return {
          ...s,
          items: s.items.filter((i) =>
            isNavItemVisibleForTenant(i, me.tenant_type, enabledOptionalUnits, me.feature_flags),
          ),
        };
      })
      .filter((s) => {
        if (s.directLink) return true;
        if (s.subsections && s.subsections.length > 0) return s.subsections.some((sub) => sub.items.length > 0);
        return s.items.length > 0;
      });
    return flattenMenuRoutes(filtered);
  }, [me, enabledOptionalUnits, hasPermission]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-status-danger">{error}</div>;
  if (!me) return <Navigate to="/login" replace />;

  const displayName = me.first_name
    ? `${me.first_name} ${me.last_name ?? ""}`.trim()
    : (me.username?.trim() || me.email);

  const role = (me.role_name || "").toLowerCase();
  const showHealthDetails = ["admin", "owner", "manager"].includes(role);
  const appShellV2 = me.feature_flags?.app_shell_v2 === true;

  return (
    <div className="flex min-h-[100dvh] overflow-hidden bg-surface-base lg:h-screen">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-[100] -translate-y-[220%] rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow-md outline-none ring-2 ring-brand-primary/40 transition focus:translate-y-0"
      >
        Skip to content
      </a>
      <div className="hidden lg:flex">
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
          className="erp-main-content flex-1 overflow-y-auto bg-surface-base p-3 pb-20 sm:p-4 md:p-4 lg:p-5 lg:pb-4 focus:outline-none"
        >
          <DemoModeBanner />
          {announcements.length > 0 && (
            <div className="mb-3 space-y-2" aria-live="polite">
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
          <Outlet />
        </main>
        <div className="hidden lg:block">
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
