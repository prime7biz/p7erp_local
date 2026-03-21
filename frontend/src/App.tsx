import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/app/router";
import { Seo } from "@/components/Seo";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Seo />
        <AppRouter />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
