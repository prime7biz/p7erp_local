import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/app/router";
import { Seo } from "@/components/Seo";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AiChatProvider } from "@/context/AiChatContext";
import { queryClient } from "@/lib/queryClient";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AuthProvider>
          <AiChatProvider>
            <Seo />
            <AppRouter />
          </AiChatProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
