import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { SignUp } from "@/pages/SignUp";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { PublicLayout } from "@/components/public/PublicLayout";
import { FeaturesPage } from "@/pages/public/FeaturesPage";
import { PricingPage } from "@/pages/public/PricingPage";
import { AboutPage } from "@/pages/public/AboutPage";
import { ContactPage } from "@/pages/public/ContactPage";
import { GarmentsErpPage } from "@/pages/public/GarmentsErpPage";
import { BuyingHouseErpPage } from "@/pages/public/BuyingHouseErpPage";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { TermsPage as LegalTermsPage } from "@/pages/legal/TermsPage";
import { PrivacyPage as LegalPrivacyPage } from "@/pages/legal/PrivacyPage";
import { DpaPage } from "@/pages/legal/DpaPage";
import { AiDisclaimerPage } from "@/pages/legal/AiDisclaimerPage";
import { SlaPage } from "@/pages/legal/SlaPage";
import { SecurityCompliancePage } from "@/pages/legal/SecurityCompliancePage";
import { TrustCenterPage } from "@/pages/legal/TrustCenterPage";
import { HowItWorksPage } from "@/pages/public/HowItWorksPage";
import { SecurityPage } from "@/pages/public/SecurityPage";
import { ErpBangladeshPage } from "@/pages/public/ErpBangladeshPage";
import { ErpComparisonPage } from "@/pages/public/ErpComparisonPage";
import { ResourcesPage } from "@/pages/public/ResourcesPage";
import { SupportPage } from "@/pages/public/SupportPage";
import { VerifyProformaPage } from "@/pages/VerifyProformaPage";
import { GlobalAiChatWidget } from "@/components/GlobalAiChatWidget";
import { ExternalAccessGuard } from "@/components/external-access/ExternalAccessGuard";

const AppProtectedRouter = lazy(() =>
  import("@/app/AppProtectedRouter").then((mod) => ({ default: mod.AppProtectedRouter })),
);

const CustomerLoginPage = lazy(() =>
  import("@/pages/portal/customer/CustomerLoginPage").then((m) => ({ default: m.CustomerLoginPage })),
);
const CustomerAcceptInvitePage = lazy(() =>
  import("@/pages/portal/customer/CustomerAcceptInvitePage").then((m) => ({ default: m.CustomerAcceptInvitePage })),
);
const CustomerPortalLayout = lazy(() =>
  import("@/pages/portal/customer/CustomerPortalLayout").then((m) => ({ default: m.CustomerPortalLayout })),
);
const CustomerDashboardPage = lazy(() =>
  import("@/pages/portal/customer/CustomerDashboardPage").then((m) => ({ default: m.CustomerDashboardPage })),
);
const CustomerOrdersPage = lazy(() =>
  import("@/pages/portal/customer/CustomerOrdersPage").then((m) => ({ default: m.CustomerOrdersPage })),
);
const CustomerOrderDetailPage = lazy(() =>
  import("@/pages/portal/customer/CustomerOrderDetailPage").then((m) => ({ default: m.CustomerOrderDetailPage })),
);
const CustomerApprovalsPage = lazy(() =>
  import("@/pages/portal/customer/CustomerApprovalsPage").then((m) => ({ default: m.CustomerApprovalsPage })),
);
const CustomerShipmentsPage = lazy(() =>
  import("@/pages/portal/customer/CustomerShipmentsPage").then((m) => ({ default: m.CustomerShipmentsPage })),
);
const CustomerNotesPage = lazy(() =>
  import("@/pages/portal/customer/CustomerNotesPage").then((m) => ({ default: m.CustomerNotesPage })),
);

const FinancierLoginPage = lazy(() =>
  import("@/pages/portal/financier/FinancierLoginPage").then((m) => ({ default: m.FinancierLoginPage })),
);
const FinancierAcceptInvitePage = lazy(() =>
  import("@/pages/portal/financier/FinancierAcceptInvitePage").then((m) => ({ default: m.FinancierAcceptInvitePage })),
);
const FinancierPortalLayout = lazy(() =>
  import("@/pages/portal/financier/FinancierPortalLayout").then((m) => ({ default: m.FinancierPortalLayout })),
);
const FinancierDashboardPage = lazy(() =>
  import("@/pages/portal/financier/FinancierDashboardPage").then((m) => ({ default: m.FinancierDashboardPage })),
);
const FinancierOrderBookPage = lazy(() =>
  import("@/pages/portal/financier/FinancierOrderBookPage").then((m) => ({ default: m.FinancierOrderBookPage })),
);
const FinancierOrderDetailPage = lazy(() =>
  import("@/pages/portal/financier/FinancierOrderDetailPage").then((m) => ({ default: m.FinancierOrderDetailPage })),
);
const FinancierPipelinePage = lazy(() =>
  import("@/pages/portal/financier/FinancierPipelinePage").then((m) => ({ default: m.FinancierPipelinePage })),
);
const FinancierGoodsMovementPage = lazy(() =>
  import("@/pages/portal/financier/FinancierGoodsMovementPage").then((m) => ({ default: m.FinancierGoodsMovementPage })),
);
const FinancierFinancialSummaryPage = lazy(() =>
  import("@/pages/portal/financier/FinancierFinancialSummaryPage").then((m) => ({ default: m.FinancierFinancialSummaryPage })),
);
const FinancierProjectionsPage = lazy(() =>
  import("@/pages/portal/financier/FinancierProjectionsPage").then((m) => ({ default: m.FinancierProjectionsPage })),
);
const FinancierAlertsPage = lazy(() =>
  import("@/pages/portal/financier/FinancierAlertsPage").then((m) => ({ default: m.FinancierAlertsPage })),
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("p7_token");
  const tenantId = localStorage.getItem("p7_tenant_id");
  if (!token || !tenantId) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function BlogSlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={slug ? `/resources/${slug}` : "/resources"} replace />;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const portalRouteFallback = (
  <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">Loading portal…</div>
);

export function AppRouter() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
        <Route path="/features" element={<PublicLayout><FeaturesPage /></PublicLayout>} />
        <Route path="/pricing" element={<PublicLayout><PricingPage /></PublicLayout>} />
        <Route path="/about" element={<PublicLayout><AboutPage /></PublicLayout>} />
        <Route path="/contact" element={<PublicLayout><ContactPage /></PublicLayout>} />
        <Route path="/garments-erp" element={<PublicLayout><GarmentsErpPage /></PublicLayout>} />
        <Route path="/buying-house-erp" element={<PublicLayout><BuyingHouseErpPage /></PublicLayout>} />
        <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/legal" element={<PublicLayout><LegalLayout /></PublicLayout>}>
          <Route index element={<Navigate to="terms" replace />} />
          <Route path="terms" element={<LegalTermsPage />} />
          <Route path="privacy" element={<LegalPrivacyPage />} />
          <Route path="dpa" element={<DpaPage />} />
          <Route path="ai-disclaimer" element={<AiDisclaimerPage />} />
          <Route path="sla" element={<SlaPage />} />
          <Route path="security-compliance" element={<SecurityCompliancePage />} />
        </Route>
        <Route path="/trust-center" element={<PublicLayout><TrustCenterPage /></PublicLayout>} />
        <Route path="/how-it-works" element={<PublicLayout><HowItWorksPage /></PublicLayout>} />
        <Route path="/security" element={<PublicLayout><SecurityPage /></PublicLayout>} />
        <Route path="/erp-bangladesh" element={<PublicLayout><ErpBangladeshPage /></PublicLayout>} />
        <Route path="/erp-comparison" element={<PublicLayout><ErpComparisonPage /></PublicLayout>} />
        <Route path="/blog" element={<Navigate to="/resources" replace />} />
        <Route path="/blog/:slug" element={<BlogSlugRedirect />} />
        <Route path="/resources" element={<PublicLayout><ResourcesPage /></PublicLayout>} />
        <Route path="/resources/:slug" element={<PublicLayout><ResourcesPage /></PublicLayout>} />
        <Route path="/support" element={<PublicLayout><SupportPage /></PublicLayout>} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify/proforma" element={<VerifyProformaPage />} />
        <Route
          path="/portal/customer/login"
          element={
            <Suspense fallback={portalRouteFallback}>
              <CustomerLoginPage />
            </Suspense>
          }
        />
        <Route
          path="/portal/customer/accept-invite"
          element={
            <Suspense fallback={portalRouteFallback}>
              <CustomerAcceptInvitePage />
            </Suspense>
          }
        />
        <Route
          path="/portal/customer"
          element={
            <Suspense fallback={portalRouteFallback}>
              <ExternalAccessGuard portal="customer">
                <CustomerPortalLayout />
              </ExternalAccessGuard>
            </Suspense>
          }
        >
          <Route index element={<CustomerDashboardPage />} />
          <Route path="orders" element={<CustomerOrdersPage />} />
          <Route path="orders/:orderId" element={<CustomerOrderDetailPage />} />
          <Route path="approvals" element={<CustomerApprovalsPage />} />
          <Route path="shipments" element={<CustomerShipmentsPage />} />
          <Route path="notes" element={<CustomerNotesPage />} />
        </Route>
        <Route
          path="/portal/financier/login"
          element={
            <Suspense fallback={portalRouteFallback}>
              <FinancierLoginPage />
            </Suspense>
          }
        />
        <Route
          path="/portal/financier/accept-invite"
          element={
            <Suspense fallback={portalRouteFallback}>
              <FinancierAcceptInvitePage />
            </Suspense>
          }
        />
        <Route
          path="/portal/financier"
          element={
            <Suspense fallback={portalRouteFallback}>
              <ExternalAccessGuard portal="financier">
                <FinancierPortalLayout />
              </ExternalAccessGuard>
            </Suspense>
          }
        >
          <Route index element={<FinancierDashboardPage />} />
          <Route path="order-book" element={<FinancierOrderBookPage />} />
          <Route path="orders/:orderId" element={<FinancierOrderDetailPage />} />
          <Route path="pipeline" element={<FinancierPipelinePage />} />
          <Route path="goods-movement" element={<FinancierGoodsMovementPage />} />
          <Route path="financial-summary" element={<FinancierFinancialSummaryPage />} />
          <Route path="projections" element={<FinancierProjectionsPage />} />
          <Route path="alerts" element={<FinancierAlertsPage />} />
        </Route>
        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm text-text-muted">Loading app...</div>}>
                <AppProtectedRouter />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalAiChatWidget />
    </>
  );
}
