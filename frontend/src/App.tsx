import { Suspense, useLayoutEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/app/router";
import { Seo } from "@/components/Seo";
import { AnalyticsPageviews } from "@/components/AnalyticsPageviews";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AppUpdateBanner } from "@/components/shell/AppUpdateBanner";
import { AiChatProvider } from "@/context/AiChatContext";
import { queryClient } from "@/lib/queryClient";
import { isPrerenderedPagePending, revealApp } from "@/lib/prerenderSnapshot";

// Shown while a lazily loaded page's code is downloading.
const pageLoadingFallback = (
  <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">Loading…</div>
);

/**
 * Pre-rendered public pages (src/lib/prerenderSnapshot.ts): swap to the app once the routed page has
 * rendered. Layout effects inside a suspended boundary do not run, so this fires only for real content.
 */
function RevealWhenRendered() {
  useLayoutEffect(() => {
    revealApp();
  }, []);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AuthProvider>
          <AiChatProvider>
            <Seo />
            <AnalyticsPageviews />
            <AppUpdateBanner />
            <Suspense fallback={pageLoadingFallback}>
              {isPrerenderedPagePending() ? <RevealWhenRendered /> : null}
              <AppRouter />
            </Suspense>
          </AiChatProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
