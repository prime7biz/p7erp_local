import { Navigate, Route, Routes } from "react-router-dom";
import { useAdminAuth } from "./context/AdminAuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TenantListPage } from "./pages/tenants/TenantListPage";
import { TenantDetailPage } from "./pages/tenants/TenantDetailPage";
import { AuditLogPage } from "./pages/monitoring/AuditLogPage";
import { SystemHealthPage } from "./pages/monitoring/SystemHealthPage";
import { BackupJobsPage } from "./pages/backup/BackupJobsPage";
import { AIUsagePage } from "./pages/ai/AIUsagePage";
import { BillingPlansPage } from "./pages/billing/BillingPlansPage";
import { AnnouncementsPage } from "./pages/support/AnnouncementsPage";
import { AdminUsersPage } from "./pages/security/AdminUsersPage";
import { AdminLayout } from "./components/AdminLayout";

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
        <Route index element={<DashboardPage />} />
        <Route path="tenants" element={<TenantListPage />} />
        <Route path="tenants/:id" element={<TenantDetailPage />} />
        <Route path="monitoring/audit" element={<AuditLogPage />} />
        <Route path="monitoring/health" element={<SystemHealthPage />} />
        <Route path="backup/jobs" element={<BackupJobsPage />} />
        <Route path="ai/usage" element={<AIUsagePage />} />
        <Route path="billing/plans" element={<BillingPlansPage />} />
        <Route path="support/announcements" element={<AnnouncementsPage />} />
        <Route path="security/admins" element={<AdminUsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
