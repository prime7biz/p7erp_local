import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Landing } from "@/pages/Landing";
import { UnifiedLoginPage } from "@/pages/UnifiedLoginPage";
import { SignUp } from "@/pages/SignUp";
import { UnifiedForgotPasswordPage } from "@/pages/UnifiedForgotPasswordPage";
import { StaffAcceptInvitePage } from "@/pages/StaffAcceptInvitePage";
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
import { SitemapPage } from "@/pages/public/SitemapPage";
import { NotFoundPage } from "@/pages/public/NotFoundPage";
import { SupportPage } from "@/pages/public/SupportPage";
import { VerifyProformaPage } from "@/pages/VerifyProformaPage";
import { GlobalAiChatWidget } from "@/components/GlobalAiChatWidget";
import { ExternalAccessGuard } from "@/components/external-access/ExternalAccessGuard";
import { PortalLegacyLoginRedirect } from "@/components/external-access/PortalLegacyLoginRedirect";

const AppProtectedRouter = lazy(() =>
  import("@/app/AppProtectedRouter").then((mod) => ({ default: mod.AppProtectedRouter })),
);

const CustomerAcceptInvitePage = lazy(() =>
  import("@/pages/portal/customer/CustomerAcceptInvitePage").then((m) => ({ default: m.CustomerAcceptInvitePage })),
);
const CustomerResetPasswordPage = lazy(() =>
  import("@/pages/portal/customer/CustomerResetPasswordPage").then((m) => ({ default: m.CustomerResetPasswordPage })),
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

const FinancierAcceptInvitePage = lazy(() =>
  import("@/pages/portal/financier/FinancierAcceptInvitePage").then((m) => ({ default: m.FinancierAcceptInvitePage })),
);
const FinancierResetPasswordPage = lazy(() =>
  import("@/pages/portal/financier/FinancierResetPasswordPage").then((m) => ({ default: m.FinancierResetPasswordPage })),
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
const FinancierCreditLinesPage = lazy(() =>
  import("@/pages/portal/financier/FinancierCreditLinesPage").then((m) => ({ default: m.FinancierCreditLinesPage })),
);
const FinancierLoanPortfolioPage = lazy(() =>
  import("@/pages/portal/financier/FinancierLoanPortfolioPage").then((m) => ({ default: m.FinancierLoanPortfolioPage })),
);
const FinancierLoanDetailPage = lazy(() =>
  import("@/pages/portal/financier/FinancierLoanDetailPage").then((m) => ({ default: m.FinancierLoanDetailPage })),
);
const FinancierProcurementTrackerPage = lazy(() =>
  import("@/pages/portal/financier/FinancierProcurementTrackerPage").then((m) => ({ default: m.FinancierProcurementTrackerPage })),
);
const FinancierStockCollateralPage = lazy(() =>
  import("@/pages/portal/financier/FinancierStockCollateralPage").then((m) => ({ default: m.FinancierStockCollateralPage })),
);
const FinancierBtbLiabilitiesPage = lazy(() =>
  import("@/pages/portal/financier/FinancierBtbLiabilitiesPage").then((m) => ({ default: m.FinancierBtbLiabilitiesPage })),
);
const FinancierInventoryPage = lazy(() =>
  import("@/pages/portal/financier/FinancierInventoryPage").then((m) => ({ default: m.FinancierInventoryPage })),
);
const FinancierTraceabilityPage = lazy(() =>
  import("@/pages/portal/financier/FinancierTraceabilityPage").then((m) => ({ default: m.FinancierTraceabilityPage })),
);
const FinancierTraceabilityDetailPage = lazy(() =>
  import("@/pages/portal/financier/FinancierTraceabilityDetailPage").then((m) => ({ default: m.FinancierTraceabilityDetailPage })),
);
const FinancierBusinessHealthPage = lazy(() =>
  import("@/pages/portal/financier/FinancierBusinessHealthPage").then((m) => ({ default: m.FinancierBusinessHealthPage })),
);
const FinancierSnapshotsPage = lazy(() =>
  import("@/pages/portal/financier/FinancierSnapshotsPage").then((m) => ({ default: m.FinancierSnapshotsPage })),
);
const FinancierReportsPage = lazy(() =>
  import("@/pages/portal/financier/FinancierReportsPage").then((m) => ({ default: m.FinancierReportsPage })),
);
const FinancierAiConfidencePage = lazy(() =>
  import("@/pages/portal/financier/FinancierAiConfidencePage").then((m) => ({ default: m.FinancierAiConfidencePage })),
);
const FinancierOrderFinancePage = lazy(() =>
  import("@/pages/portal/financier/FinancierOrderFinancePage").then((m) => ({ default: m.FinancierOrderFinancePage })),
);
const FinancierRecoveryOutlookPage = lazy(() =>
  import("@/pages/portal/financier/FinancierRecoveryOutlookPage").then((m) => ({
    default: m.FinancierRecoveryOutlookPage,
  })),
);
const FinancierRawMaterialPage = lazy(() =>
  import("@/pages/portal/financier/FinancierRawMaterialPage").then((m) => ({ default: m.FinancierRawMaterialPage })),
);
const FinancierProductionTrackerPage = lazy(() =>
  import("@/pages/portal/financier/FinancierProductionTrackerPage").then((m) => ({ default: m.FinancierProductionTrackerPage })),
);
const FinancierFinancialVisibilityPage = lazy(() =>
  import("@/pages/portal/financier/FinancierFinancialVisibilityPage").then((m) => ({ default: m.FinancierFinancialVisibilityPage })),
);
const FinancierRiskPanelPage = lazy(() =>
  import("@/pages/portal/financier/FinancierRiskPanelPage").then((m) => ({ default: m.FinancierRiskPanelPage })),
);
const FinancierContractsListPage = lazy(() =>
  import("@/pages/portal/financier/FinancierContractsListPage").then((m) => ({ default: m.FinancierContractsListPage })),
);
const FinancierContractDetailPage = lazy(() =>
  import("@/pages/portal/financier/FinancierContractDetailPage").then((m) => ({ default: m.FinancierContractDetailPage })),
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
        <Route path="/sitemap" element={<PublicLayout><SitemapPage /></PublicLayout>} />
        <Route path="/login" element={<UnifiedLoginPage />} />
        <Route path="/forgot-password" element={<UnifiedForgotPasswordPage />} />
        <Route path="/accept-invite" element={<StaffAcceptInvitePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify/proforma" element={<VerifyProformaPage />} />
        <Route path="/portal/customer/login" element={<PortalLegacyLoginRedirect role="customer" />} />
        <Route
          path="/portal/customer/accept-invite"
          element={
            <Suspense fallback={portalRouteFallback}>
              <CustomerAcceptInvitePage />
            </Suspense>
          }
        />
        <Route path="/portal/customer/forgot-password" element={<Navigate to="/forgot-password?role=customer" replace />} />
        <Route
          path="/portal/customer/reset-password"
          element={
            <Suspense fallback={portalRouteFallback}>
              <CustomerResetPasswordPage />
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
        <Route path="/portal/financier/login" element={<PortalLegacyLoginRedirect role="financier" />} />
        <Route
          path="/portal/financier/accept-invite"
          element={
            <Suspense fallback={portalRouteFallback}>
              <FinancierAcceptInvitePage />
            </Suspense>
          }
        />
        <Route path="/portal/financier/forgot-password" element={<Navigate to="/forgot-password?role=financier" replace />} />
        <Route
          path="/portal/financier/reset-password"
          element={
            <Suspense fallback={portalRouteFallback}>
              <FinancierResetPasswordPage />
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
          <Route path="contracts/:contractId" element={<FinancierContractDetailPage />} />
          <Route path="contracts" element={<FinancierContractsListPage />} />
          <Route path="order-book" element={<FinancierOrderBookPage />} />
          <Route path="orders/:orderId" element={<FinancierOrderDetailPage />} />
          <Route path="pipeline" element={<FinancierPipelinePage />} />
          <Route path="goods-movement" element={<FinancierGoodsMovementPage />} />
          <Route path="financial-summary" element={<FinancierFinancialSummaryPage />} />
          <Route path="projections" element={<FinancierProjectionsPage />} />
          <Route path="credit-lines" element={<FinancierCreditLinesPage />} />
          <Route path="loan-portfolio/:utilizationId" element={<FinancierLoanDetailPage />} />
          <Route path="loan-portfolio" element={<FinancierLoanPortfolioPage />} />
          <Route path="order-finance" element={<FinancierOrderFinancePage />} />
          <Route path="recovery-outlook" element={<FinancierRecoveryOutlookPage />} />
          <Route path="procurement" element={<FinancierProcurementTrackerPage />} />
          <Route path="raw-materials" element={<FinancierRawMaterialPage />} />
          <Route path="production-tracker" element={<Navigate to="/portal/financier/production" replace />} />
          <Route path="production" element={<FinancierProductionTrackerPage />} />
          <Route path="stock-collateral" element={<FinancierStockCollateralPage />} />
          <Route path="btb-liabilities" element={<FinancierBtbLiabilitiesPage />} />
          <Route path="inventory/:itemId" element={<FinancierInventoryPage />} />
          <Route path="inventory" element={<FinancierInventoryPage />} />
          <Route path="traceability/:utilizationId" element={<FinancierTraceabilityDetailPage />} />
          <Route path="traceability" element={<FinancierTraceabilityPage />} />
          <Route path="financial-visibility" element={<FinancierFinancialVisibilityPage />} />
          <Route path="business-health" element={<FinancierBusinessHealthPage />} />
          <Route path="ai-confidence" element={<FinancierAiConfidencePage />} />
          <Route path="snapshots" element={<FinancierSnapshotsPage />} />
          <Route path="reports" element={<FinancierReportsPage />} />
          <Route path="alerts" element={<FinancierAlertsPage />} />
          <Route path="risk-panel" element={<FinancierRiskPanelPage />} />
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
        <Route
          path="*"
          element={
            <PublicLayout>
              <NotFoundPage />
            </PublicLayout>
          }
        />
      </Routes>
      <GlobalAiChatWidget />
    </>
  );
}
