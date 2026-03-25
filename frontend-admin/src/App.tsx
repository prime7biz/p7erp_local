import { Navigate, Route, Routes } from "react-router-dom";
import { useAdminAuth } from "./context/AdminAuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TenantListPage } from "./pages/tenants/TenantListPage";
import { TenantDetailPage } from "./pages/tenants/TenantDetailPage";
import { TenantCreatePage } from "./pages/tenants/TenantCreatePage";
import { AuditLogPage } from "./pages/monitoring/AuditLogPage";
import { AdminAuditPage } from "./pages/monitoring/AdminAuditPage";
import { SystemHealthPage } from "./pages/monitoring/SystemHealthPage";
import { UsageTrendsPage } from "./pages/monitoring/UsageTrendsPage";
import { BackupCenterPage } from "./pages/operations/BackupCenterPage";
import { AIOperationsPage } from "./pages/operations/AIOperationsPage";
import { BillingPlansPage } from "./pages/billing/BillingPlansPage";
import { PlanFormPage } from "./pages/billing/PlanFormPage";
import { SubscriptionsPage } from "./pages/billing/SubscriptionsPage";
import { InvoicesPage } from "./pages/billing/InvoicesPage";
import { PaymentsPage } from "./pages/billing/PaymentsPage";
import { RevenuePage } from "./pages/billing/RevenuePage";
import { AnnouncementsPage } from "./pages/support/AnnouncementsPage";
import { AnnouncementFormPage } from "./pages/support/AnnouncementFormPage";
import { SupportTicketsPage } from "./pages/support/SupportTicketsPage";
import { AdminUsersPage } from "./pages/security/AdminUsersPage";
import { SessionsPage } from "./pages/security/SessionsPage";
import { RateLimitsPage } from "./pages/security/RateLimitsPage";
import { ImpersonationLogPage } from "./pages/security/ImpersonationLogPage";
import { PlatformSettingsPage } from "./pages/config/PlatformSettingsPage";
import { FeatureFlagsPage } from "./pages/config/FeatureFlagsPage";
import { AdminLayout } from "./components/AdminLayout";
import { RequireCapability } from "./components/RequireCapability";
import { RestoreCenterPage } from "./pages/operations/RestoreCenterPage";
import { BackgroundJobsPage } from "./pages/operations/BackgroundJobsPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAdminAuth();
  if (loading) return <div className="p-8">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AdminLayout />
          </Protected>
        }
      >
        <Route
          index
          element={
            <RequireCapability capability="dashboard">
              <DashboardPage />
            </RequireCapability>
          }
        />
        <Route
          path="tenants"
          element={
            <RequireCapability capability="tenants.view">
              <TenantListPage />
            </RequireCapability>
          }
        />
        <Route
          path="tenants/new"
          element={
            <RequireCapability capability="tenants.create">
              <TenantCreatePage />
            </RequireCapability>
          }
        />
        <Route
          path="tenants/:id"
          element={
            <RequireCapability capability="tenants.view">
              <TenantDetailPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/plans"
          element={
            <RequireCapability capability="billing.view">
              <BillingPlansPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/plans/new"
          element={
            <RequireCapability capability="billing.manage_plans">
              <PlanFormPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/plans/:id/edit"
          element={
            <RequireCapability capability="billing.manage_plans">
              <PlanFormPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/subscriptions"
          element={
            <RequireCapability capability="billing.view">
              <SubscriptionsPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/invoices"
          element={
            <RequireCapability capability="billing.view">
              <InvoicesPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/payments"
          element={
            <RequireCapability capability="billing.view">
              <PaymentsPage />
            </RequireCapability>
          }
        />
        <Route
          path="billing/revenue"
          element={
            <RequireCapability capability="billing.view">
              <RevenuePage />
            </RequireCapability>
          }
        />
        <Route
          path="operations/backups"
          element={
            <RequireCapability capability="operations.backups">
              <BackupCenterPage />
            </RequireCapability>
          }
        />
        <Route
          path="operations/jobs"
          element={
            <RequireCapability capability="operations.background_jobs">
              <BackgroundJobsPage />
            </RequireCapability>
          }
        />
        <Route
          path="operations/restore"
          element={
            <RequireCapability capability="operations.restore">
              <RestoreCenterPage />
            </RequireCapability>
          }
        />
        <Route
          path="operations/ai"
          element={
            <RequireCapability capability="operations.ai">
              <AIOperationsPage />
            </RequireCapability>
          }
        />
        <Route
          path="support/announcements"
          element={
            <RequireCapability capability="support.announcements">
              <AnnouncementsPage />
            </RequireCapability>
          }
        />
        <Route
          path="support/announcements/new"
          element={
            <RequireCapability capability="support.announcements">
              <AnnouncementFormPage />
            </RequireCapability>
          }
        />
        <Route
          path="support/announcements/:id/edit"
          element={
            <RequireCapability capability="support.announcements">
              <AnnouncementFormPage />
            </RequireCapability>
          }
        />
        <Route
          path="support/tickets"
          element={
            <RequireCapability capability="support.tickets">
              <SupportTicketsPage />
            </RequireCapability>
          }
        />
        <Route
          path="monitoring/audit"
          element={
            <RequireCapability capability="monitoring.tenant_audit">
              <AuditLogPage />
            </RequireCapability>
          }
        />
        <Route
          path="monitoring/admin-audit"
          element={
            <RequireCapability capability="monitoring.admin_audit">
              <AdminAuditPage />
            </RequireCapability>
          }
        />
        <Route
          path="monitoring/health"
          element={
            <RequireCapability capability="monitoring.health_basic">
              <SystemHealthPage />
            </RequireCapability>
          }
        />
        <Route
          path="monitoring/usage"
          element={
            <RequireCapability capability="monitoring.usage">
              <UsageTrendsPage />
            </RequireCapability>
          }
        />
        <Route
          path="security/admins"
          element={
            <RequireCapability capability="security.admins">
              <AdminUsersPage />
            </RequireCapability>
          }
        />
        <Route
          path="security/sessions"
          element={
            <RequireCapability capability="security.sessions">
              <SessionsPage />
            </RequireCapability>
          }
        />
        <Route
          path="security/rate-limits"
          element={
            <RequireCapability capability="security.rate_limits">
              <RateLimitsPage />
            </RequireCapability>
          }
        />
        <Route
          path="security/impersonation"
          element={
            <RequireCapability capability="security.impersonation">
              <ImpersonationLogPage />
            </RequireCapability>
          }
        />
        <Route
          path="config/settings"
          element={
            <RequireCapability capability="config.settings_read">
              <PlatformSettingsPage />
            </RequireCapability>
          }
        />
        <Route
          path="config/feature-flags"
          element={
            <RequireCapability capability="config.feature_flags">
              <FeatureFlagsPage />
            </RequireCapability>
          }
        />
        {/* Legacy redirects */}
        <Route path="backup/jobs" element={<Navigate to="/operations/backups" replace />} />
        <Route path="ai/usage" element={<Navigate to="/operations/ai" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
