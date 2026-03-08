import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const AdminLogin = lazy(() => import("@/pages/admin/admin-login"));
const AdminDashboard = lazy(() => import("@/pages/admin/admin-dashboard"));
const AdminTenants = lazy(() => import("@/pages/admin/admin-tenants"));
const AdminTenantDetail = lazy(() => import("@/pages/admin/admin-tenant-detail"));
const AdminTickets = lazy(() => import("@/pages/admin/admin-tickets"));
const AdminBilling = lazy(() => import("@/pages/admin/admin-billing"));
const AdminAuditLogs = lazy(() => import("@/pages/admin/admin-audit-logs"));
const AdminSubscriptions = lazy(() => import("@/pages/admin/admin-subscriptions"));
const AdminCOAImport = lazy(() => import("@/pages/admin/admin-coa-import"));

function PageLoader() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24 ml-auto" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function AdminApp() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/admin/login">{() => <AdminLogin />}</Route>
        <Route path="/admin/tenants/:id">{() => <AdminTenantDetail />}</Route>
        <Route path="/admin/tenants">{() => <AdminTenants />}</Route>
        <Route path="/admin/subscriptions">{() => <AdminSubscriptions />}</Route>
        <Route path="/admin/tickets">{() => <AdminTickets />}</Route>
        <Route path="/admin/billing">{() => <AdminBilling />}</Route>
        <Route path="/admin/audit-logs">{() => <AdminAuditLogs />}</Route>
        <Route path="/admin/coa-import">{() => <AdminCOAImport />}</Route>
        <Route path="/admin">{() => <AdminDashboard />}</Route>
      </Switch>
    </Suspense>
  );
}

export default AdminApp;
