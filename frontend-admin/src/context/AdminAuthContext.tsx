import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminLogin, adminMe, clearAdminToken, getAdminToken, setAdminToken } from "@/api/client";

type Me = { id: number; username: string; email: string; role: string };

type Ctx = {
  token: string | null;
  me: Me | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
  refetch: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getAdminToken());
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    const t = getAdminToken();
    if (!t) {
      setMe(null);
      return;
    }
    setLoading(true);
    try {
      const m = await adminMe();
      setMe(m);
    } catch {
      setMe(null);
      clearAdminToken();
      setTok(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await adminLogin(username, password);
    setAdminToken(res.access_token);
    setTok(res.access_token);
    await refetch();
  }, [refetch]);

  const logout = useCallback(() => {
    clearAdminToken();
    setTok(null);
    setMe(null);
  }, []);

  useEffect(() => {
    if (getAdminToken()) void refetch();
  }, [refetch]);

  const value = useMemo(
    () => ({ token, me, loading, login, logout, refetch }),
    [token, me, loading, login, logout, refetch],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const c = useContext(AdminAuthContext);
  if (!c) throw new Error("useAdminAuth outside provider");
  return c;
}
