import { Switch, Route, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ErrorBoundary } from "@/components/error-boundary";

const AppArea = lazy(() => import("./AppArea"));
const AdminArea = lazy(() => import("./AdminArea"));

const LandingPage = lazy(() => import("@/pages/public/landing"));
const PublicFeaturesPage = lazy(() => import("@/pages/public/features"));
const GarmentsErpPage = lazy(() => import("@/pages/public/garments-erp"));
const BuyingHouseErpPage = lazy(() => import("@/pages/public/buying-house-erp"));
const ErpSoftwareBangladeshPage = lazy(() => import("@/pages/public/erp-software-bangladesh"));
const GarmentErpSoftwarePage = lazy(() => import("@/pages/public/garment-erp-software"));
const ApparelProductionManagementPage = lazy(() => import("@/pages/public/apparel-production-management"));
const TextileErpSystemPage = lazy(() => import("@/pages/public/textile-erp-system"));
const ErpComparisonPage = lazy(() => import("@/pages/public/erp-comparison"));
const PublicPricingPage = lazy(() => import("@/pages/public/pricing"));
const PublicAboutPage = lazy(() => import("@/pages/public/about"));
const PublicContactPage = lazy(() => import("@/pages/public/contact"));
const HowItWorksPage = lazy(() => import("@/pages/public/how-it-works"));
const PublicSecurityPage = lazy(() => import("@/pages/public/security"));
const PrivacyPage = lazy(() => import("@/pages/public/privacy"));
const TermsPage = lazy(() => import("@/pages/public/terms"));
const ResourcesPage = lazy(() => import("@/pages/public/resources"));
const VerifyPage = lazy(() => import("@/pages/verify/index"));

const ModuleMerchandising = lazy(() => import("@/pages/public/modules/merchandising"));
const ModuleInventory = lazy(() => import("@/pages/public/modules/inventory"));
const ModuleAccounting = lazy(() => import("@/pages/public/modules/accounting"));
const ModuleProduction = lazy(() => import("@/pages/public/modules/production"));
const ModuleLcProcessing = lazy(() => import("@/pages/public/modules/lc-processing"));
const ModuleQualityManagement = lazy(() => import("@/pages/public/modules/quality-management"));
const ModuleHrPayroll = lazy(() => import("@/pages/public/modules/hr-payroll"));
const ModuleReportsAnalytics = lazy(() => import("@/pages/public/modules/reports-analytics"));
const ModuleCrmSupport = lazy(() => import("@/pages/public/modules/crm-support"));

function PublicWebsite() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/features" component={PublicFeaturesPage} />
        <Route path="/garments-erp" component={GarmentsErpPage} />
        <Route path="/buying-house-erp" component={BuyingHouseErpPage} />
        <Route path="/erp-software-bangladesh" component={ErpSoftwareBangladeshPage} />
        <Route path="/garment-erp-software" component={GarmentErpSoftwarePage} />
        <Route path="/apparel-production-management" component={ApparelProductionManagementPage} />
        <Route path="/textile-erp-system" component={TextileErpSystemPage} />
        <Route path="/erp-comparison" component={ErpComparisonPage} />
        <Route path="/modules/merchandising" component={ModuleMerchandising} />
        <Route path="/modules/inventory" component={ModuleInventory} />
        <Route path="/modules/accounting" component={ModuleAccounting} />
        <Route path="/modules/production" component={ModuleProduction} />
        <Route path="/modules/lc-processing" component={ModuleLcProcessing} />
        <Route path="/modules/quality-management" component={ModuleQualityManagement} />
        <Route path="/modules/hr-payroll" component={ModuleHrPayroll} />
        <Route path="/modules/reports-analytics" component={ModuleReportsAnalytics} />
        <Route path="/modules/crm-support" component={ModuleCrmSupport} />
        <Route path="/pricing" component={PublicPricingPage} />
        <Route path="/about" component={PublicAboutPage} />
        <Route path="/contact" component={PublicContactPage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/security" component={PublicSecurityPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/resources/:slug" component={ResourcesPage} />
        <Route path="/resources" component={ResourcesPage} />
        <Route component={LandingPage} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [location] = useLocation();

  if (location.startsWith("/verify/")) {
    return (
      <ErrorBoundary>
        <TooltipProvider>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <Route path="/verify/:code" component={VerifyPage} />
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/admin")) {
    return (
      <ErrorBoundary>
        <TooltipProvider>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <AdminArea />
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/app")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          <AppArea />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <CurrencyProvider>
          <PublicWebsite />
        </CurrencyProvider>
        <Toaster />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
