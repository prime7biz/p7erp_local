import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, clearAuth, MeResponse } from "@/api/client";

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<
  AuthState & { logout: () => void; refetch: () => Promise<void>; hasPermission: (key: string) => boolean }
 | null>(null);

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
    } catch (e) {
      setMe(null);
      if (e instanceof ApiError && e.status === 401) {
        setError("Session expired");
        clearAuth();
      } else {
        // Network error or server restart (e.g. during a deploy): keep the session so the user can retry.
        setError(
          e instanceof ApiError
            ? `Could not load your account (error ${e.status}). Please try again.`
            : "Could not reach the server. Please try again.",
        );
      }
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
    // Full page load so every in-memory store (AI chat, component state) from this user is dropped.
    window.location.assign("/login");
  }, []);

  const hasPermission = useCallback(
    (key: string) => {
      if (!me) return false;
      if ((me.role_name || "").toLowerCase() === "admin") return true;
      const p = me.role_permissions || {};
      if (p["*"] === true) return true;
      const mod = key.split(".")[0];
      if (mod && p[`${mod}.*`] === true) return true;
      return p[key] === true;
    },
    [me],
  );

  return (
    <AuthContext.Provider value={{ me, loading, error, logout, refetch, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook is intentionally colocated with AuthProvider for a single import surface.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
