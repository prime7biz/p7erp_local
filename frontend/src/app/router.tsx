import { Suspense, lazy, useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { ExternalAccessGuard } from "@/components/external-access/ExternalAccessGuard";
import { PortalLegacyLoginRedirect } from "@/components/external-access/PortalLegacyLoginRedirect";
import { PWA_ENABLED } from "@/lib/pwa/appUpdate";
import { SOLUTION_PAGE_PATHS } from "@/config/solutionPages";
import { startedFromPrerenderedHtml } from "@/lib/prerenderSnapshot";
import { lazyRoute } from "@/app/lazyRoute";

// Public, legal and auth pages are loaded on demand so each route only downloads its own code.
// Pre-rendered public pages use lazyRoute (same as React.lazy, plus preloading before hydration).
const Landing = lazyRoute("Landing", () => import("@/pages/Landing").then((m) => m.Landing));
const UnifiedLoginPage = lazy(() => import("@/pages/UnifiedLoginPage").then((m) => ({ default: m.UnifiedLoginPage })));
const SignUp = lazy(() => import("@/pages/SignUp").then((m) => ({ default: m.SignUp })));
const UnifiedForgotPasswordPage = lazy(() =>
  import("@/pages/UnifiedForgotPasswordPage").then((m) => ({ default: m.UnifiedForgotPasswordPage })),
);
const StaffAcceptInvitePage = lazy(() =>
  import("@/pages/StaffAcceptInvitePage").then((m) => ({ default: m.StaffAcceptInvitePage })),
);
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const PublicLayout = lazyRoute("PublicLayout", () => import("@/components/public/PublicLayout").then((m) => m.PublicLayout));
const FeaturesPage = lazyRoute("FeaturesPage", () => import("@/pages/public/FeaturesPage").then((m) => m.FeaturesPage));
const PricingPage = lazyRoute("PricingPage", () => import("@/pages/public/PricingPage").then((m) => m.PricingPage));
const AboutPage = lazyRoute("AboutPage", () => import("@/pages/public/AboutPage").then((m) => m.AboutPage));
const ContactPage = lazyRoute("ContactPage", () => import("@/pages/public/ContactPage").then((m) => m.ContactPage));
const BookDemoPage = lazyRoute("BookDemoPage", () => import("@/pages/public/BookDemoPage").then((m) => m.BookDemoPage));
const InstallAppPage = lazy(() => import("@/pages/public/InstallAppPage").then((m) => ({ default: m.InstallAppPage })));
const AccountDeletionPage = lazy(() =>
  import("@/pages/public/AccountDeletionPage").then((m) => ({ default: m.AccountDeletionPage })),
);
const RoiCalculatorPage = lazyRoute("RoiCalculatorPage", () =>
  import("@/pages/public/RoiCalculatorPage").then((m) => m.RoiCalculatorPage),
);
const GarmentsErpPage = lazyRoute("GarmentsErpPage", () => import("@/pages/public/GarmentsErpPage").then((m) => m.GarmentsErpPage));
const BuyingHouseErpPage = lazyRoute("BuyingHouseErpPage", () =>
  import("@/pages/public/BuyingHouseErpPage").then((m) => m.BuyingHouseErpPage),
);
const LegalLayout = lazyRoute("LegalLayout", () => import("@/components/legal/LegalLayout").then((m) => m.LegalLayout));
const LegalTermsPage = lazyRoute("TermsPage", () => import("@/pages/legal/TermsPage").then((m) => m.TermsPage));
const LegalPrivacyPage = lazyRoute("PrivacyPage", () => import("@/pages/legal/PrivacyPage").then((m) => m.PrivacyPage));
const DpaPage = lazyRoute("DpaPage", () => import("@/pages/legal/DpaPage").then((m) => m.DpaPage));
const AiDisclaimerPage = lazyRoute("AiDisclaimerPage", () => import("@/pages/legal/AiDisclaimerPage").then((m) => m.AiDisclaimerPage));
const SlaPage = lazyRoute("SlaPage", () => import("@/pages/legal/SlaPage").then((m) => m.SlaPage));
const SecurityCompliancePage = lazyRoute("SecurityCompliancePage", () =>
  import("@/pages/legal/SecurityCompliancePage").then((m) => m.SecurityCompliancePage),
);
const TrustCenterPage = lazyRoute("TrustCenterPage", () => import("@/pages/legal/TrustCenterPage").then((m) => m.TrustCenterPage));
const HowItWorksPage = lazyRoute("HowItWorksPage", () => import("@/pages/public/HowItWorksPage").then((m) => m.HowItWorksPage));
const SecurityPage = lazyRoute("SecurityPage", () => import("@/pages/public/SecurityPage").then((m) => m.SecurityPage));
const SolutionPage = lazyRoute("SolutionPage", () => import("@/pages/public/SolutionPage").then((m) => m.SolutionPage));
const ErpComparisonPage = lazyRoute("ErpComparisonPage", () =>
  import("@/pages/public/ErpComparisonPage").then((m) => m.ErpComparisonPage),
);
const ResourcesPage = lazyRoute("ResourcesPage", () => import("@/pages/public/ResourcesPage").then((m) => m.ResourcesPage));
const SitemapPage = lazyRoute("SitemapPage", () => import("@/pages/public/SitemapPage").then((m) => m.SitemapPage));
const NotFoundPage = lazyRoute("NotFoundPage", () => import("@/pages/public/NotFoundPage").then((m) => m.NotFoundPage));
const SupportPage = lazyRoute("SupportPage", () => import("@/pages/public/SupportPage").then((m) => m.SupportPage));
const VerifyProformaPage = lazy(() =>
  import("@/pages/VerifyProformaPage").then((m) => ({ default: m.VerifyProformaPage })),
);
const VerifyDocumentPage = lazy(() =>
  import("@/pages/VerifyDocumentPage").then((m) => ({ default: m.VerifyDocumentPage })),
);
const GlobalAiChatWidget = lazy(() =>
  import("@/components/GlobalAiChatWidget").then((m) => ({ default: m.GlobalAiChatWidget })),
);

const AppProtectedRouter = lazy(() =>
  import("@/app/AppProtectedRouter").then((mod) => ({ default: mod.AppProtectedRouter })),
);

const PortalAcceptInvitePage = lazy(() =>
  import("@/components/external-access/PortalAuthPages").then((m) => ({ default: m.PortalAcceptInvitePage })),
);
const PortalResetPasswordPage = lazy(() =>
  import("@/components/external-access/PortalAuthPages").then((m) => ({ default: m.PortalResetPasswordPage })),
);
const SupplierPortalLayout = lazy(() =>
  import("@/pages/portal/supplier/SupplierPortalLayout").then((m) => ({ default: m.SupplierPortalLayout })),
);
const SupplierDashboardPage = lazy(() =>
  import("@/pages/portal/supplier/SupplierPages").then((m) => ({ default: m.SupplierDashboardPage })),
);
const SupplierPurchaseOrdersPage = lazy(() =>
  import("@/pages/portal/supplier/SupplierPages").then((m) => ({ default: m.SupplierPurchaseOrdersPage })),
);
const SupplierPurchaseOrderDetailPage = lazy(() =>
  import("@/pages/portal/supplier/SupplierPages").then((m) => ({ default: m.SupplierPurchaseOrderDetailPage })),
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

export function ScrollToTop() {
  const { pathname } = useLocation();
  // A pre-rendered page was already visible (and maybe scrolled) before the app loaded.
  const skipFirstScroll = useRef(startedFromPrerenderedHtml());

  useEffect(() => {
    if (skipFirstScroll.current) {
      skipFirstScroll.current = false;
      return;
    }
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
        <Route path="/book-demo" element={<PublicLayout><BookDemoPage /></PublicLayout>} />
        <Route path="/roi-calculator" element={<PublicLayout><RoiCalculatorPage /></PublicLayout>} />
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
        {SOLUTION_PAGE_PATHS.map((path) => (
          <Route key={path} path={path} element={<PublicLayout><SolutionPage path={path} /></PublicLayout>} />
        ))}
        <Route path="/erp-comparison" element={<PublicLayout><ErpComparisonPage /></PublicLayout>} />
        <Route path="/blog" element={<Navigate to="/resources" replace />} />
        <Route path="/blog/:slug" element={<BlogSlugRedirect />} />
        <Route path="/resources" element={<PublicLayout><ResourcesPage /></PublicLayout>} />
        <Route path="/resources/:slug" element={<PublicLayout><ResourcesPage /></PublicLayout>} />
        <Route path="/support" element={<PublicLayout><SupportPage /></PublicLayout>} />
        <Route path="/sitemap" element={<PublicLayout><SitemapPage /></PublicLayout>} />
        {PWA_ENABLED ? <Route path="/install" element={<PublicLayout><InstallAppPage /></PublicLayout>} /> : null}
        <Route path="/account-deletion" element={<PublicLayout><AccountDeletionPage /></PublicLayout>} />
        <Route path="/login" element={<UnifiedLoginPage />} />
        <Route path="/forgot-password" element={<UnifiedForgotPasswordPage />} />
        <Route path="/accept-invite" element={<StaffAcceptInvitePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify/proforma" element={<VerifyProformaPage />} />
        <Route path="/verify/document/:verificationId" element={<VerifyDocumentPage />} />
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
        <Route path="/portal/supplier/login" element={<PortalLegacyLoginRedirect role="supplier" />} />
        <Route
          path="/portal/supplier/accept-invite"
          element={
            <Suspense fallback={portalRouteFallback}>
              <PortalAcceptInvitePage portal="supplier" />
            </Suspense>
          }
        />
        <Route path="/portal/supplier/forgot-password" element={<Navigate to="/forgot-password?role=supplier" replace />} />
        <Route
          path="/portal/supplier/reset-password"
          element={
            <Suspense fallback={portalRouteFallback}>
              <PortalResetPasswordPage portal="supplier" />
            </Suspense>
          }
        />
        <Route
          path="/portal/supplier"
          element={
            <Suspense fallback={portalRouteFallback}>
              <ExternalAccessGuard portal="supplier">
                <SupplierPortalLayout />
              </ExternalAccessGuard>
            </Suspense>
          }
        >
          <Route index element={<SupplierDashboardPage />} />
          <Route path="purchase-orders" element={<SupplierPurchaseOrdersPage />} />
          <Route path="purchase-orders/:poId" element={<SupplierPurchaseOrderDetailPage />} />
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
              <Suspense fallback={null}>
                <GlobalAiChatWidget />
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
    </>
  );
}
