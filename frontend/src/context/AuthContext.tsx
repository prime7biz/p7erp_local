import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearAuth, MeResponse, setAuth } from "@/api/client";

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthState & { logout: () => void; refetch: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const tid = localStorage.getItem("p7_tenant_id");
    const token = localStorage.getItem("p7_token");
    if (!tid || !token) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.me();
      setMe(data);
    } catch {
      setMe(null);
      setError("Session expired");
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const logout = useCallback(() => {
    clearAuth();
    setMe(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, error, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
