import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
// Small modules only: importing "@/api/client" here would put every API method in the first download.
import { authApi } from "@/api/auth";
import { ApiError, clearAuth } from "@/api/core";
import type { MeResponse } from "@/api/client";
import { useConfirm } from "@/components/app/useConfirm";
import { loadQueue, scanKeys } from "@/pages/app/production/scan/scanQueue";

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<
  AuthState & { logout: () => Promise<void>; refetch: () => Promise<void>; hasPermission: (key: string) => boolean }
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
      const data = await authApi.me();
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
    void refetch();
  }, [refetch]);

  const confirm = useConfirm();

  const logout = useCallback(async () => {
    const unsentScans = me ? loadQueue(localStorage, scanKeys(me.tenant_id, me.user_id)).length : 0;
    if (unsentScans > 0) {
      const ok = await confirm({
        title: `${unsentScans} production scan${unsentScans === 1 ? "" : "s"} not sent yet`,
        description:
          "They stay on this device under your login and are sent the next time you sign in here and open the scan station. Sign out anyway?",
        confirmLabel: "Sign out",
        cancelLabel: "Stay signed in",
      });
      if (!ok) return;
    }
    await authApi.logout();
    clearAuth();
    setMe(null);
    setError(null);
    // Full page load so every in-memory store (AI chat, component state) from this user is dropped.
    window.location.assign("/login");
  }, [me, confirm]);

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

  // Same object between renders unless something changed, so every useAuth() consumer does not re-render.
  const value = useMemo(
    () => ({ me, loading, error, logout, refetch, hasPermission }),
    [me, loading, error, logout, refetch, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook is intentionally colocated with AuthProvider for a single import surface.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
