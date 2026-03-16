import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Landing } from "@/pages/Landing";
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
import { HowItWorksPage } from "@/pages/public/HowItWorksPage";
import { SecurityPage } from "@/pages/public/SecurityPage";
import { ErpBangladeshPage } from "@/pages/public/ErpBangladeshPage";
import { ErpComparisonPage } from "@/pages/public/ErpComparisonPage";
import { ResourcesPage } from "@/pages/public/ResourcesPage";
import { SupportPage } from "@/pages/public/SupportPage";
import { VerifyProformaPage } from "@/pages/VerifyProformaPage";

const AppProtectedRouter = lazy(() =>
  import("@/app/AppProtectedRouter").then((mod) => ({ default: mod.AppProtectedRouter })),
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
      <Route path="/signup" element={<SignUp />} />
      <Route path="/verify/proforma" element={<VerifyProformaPage />} />
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">Loading app...</div>}>
              <AppProtectedRouter />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
