import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Landing } from "@/pages/Landing";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { SignUp } from "@/pages/SignUp";
import { PublicLayout } from "@/components/public/PublicLayout";
import { FeaturesPage } from "@/pages/public/FeaturesPage";
import { PricingPage } from "@/pages/public/PricingPage";
import { AboutPage } from "@/pages/public/AboutPage";
import { ContactPage } from "@/pages/public/ContactPage";
import { GarmentsErpPage } from "@/pages/public/GarmentsErpPage";
import { BuyingHouseErpPage } from "@/pages/public/BuyingHouseErpPage";
import { PrivacyPage } from "@/pages/public/PrivacyPage";
import { TermsPage } from "@/pages/public/TermsPage";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import { UsersPage } from "@/pages/settings/UsersPage";
import { RolesPage } from "@/pages/settings/RolesPage";
import { AuditPage } from "@/pages/settings/AuditPage";
import { PlaceholderPage } from "@/pages/app/PlaceholderPage";
import { CustomersPage } from "@/pages/app/CustomersPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("p7_token");
  const tenantId = localStorage.getItem("p7_tenant_id");
  if (!token || !tenantId) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
      <Route path="/features" element={<PublicLayout><FeaturesPage /></PublicLayout>} />
      <Route path="/pricing" element={<PublicLayout><PricingPage /></PublicLayout>} />
      <Route path="/about" element={<PublicLayout><AboutPage /></PublicLayout>} />
      <Route path="/contact" element={<PublicLayout><ContactPage /></PublicLayout>} />
      <Route path="/garments-erp" element={<PublicLayout><GarmentsErpPage /></PublicLayout>} />
      <Route path="/buying-house-erp" element={<PublicLayout><BuyingHouseErpPage /></PublicLayout>} />
      <Route path="/privacy" element={<PublicLayout><PrivacyPage /></PublicLayout>} />
      <Route path="/terms" element={<PublicLayout><TermsPage /></PublicLayout>} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/app/settings/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
