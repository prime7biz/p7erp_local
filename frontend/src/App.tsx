import { Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/app/router";
import { Seo } from "@/components/Seo";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AiChatProvider } from "@/context/AiChatContext";
import { queryClient } from "@/lib/queryClient";

// Shown while a lazily loaded page's code is downloading.
const pageLoadingFallback = (
  <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">Loading…</div>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AuthProvider>
          <AiChatProvider>
            <Seo />
            <Suspense fallback={pageLoadingFallback}>
              <AppRouter />
            </Suspense>
          </AiChatProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
