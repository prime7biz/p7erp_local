import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/app/router";
import { Seo } from "@/components/Seo";

export default function App() {
  return (
    <AuthProvider>
      <Seo />
      <AppRouter />
    </AuthProvider>
  );
}
