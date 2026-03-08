import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/app/router";

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
