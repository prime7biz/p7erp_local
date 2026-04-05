import { useCallback, useEffect, useState } from "react";
import {
  clearExtAuth,
  externalLogin as postExternalLogin,
  externalLogout,
  externalMe,
  getExtToken,
  setExtAuth,
} from "@/api/externalClient";
import type { ExternalMeResponse, ExternalPrincipalType, ExternalTokenResponse } from "@/types/externalAccess";

export function useExternalAuth(principalType: ExternalPrincipalType) {
  const [me, setMe] = useState<ExternalMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!getExtToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const m = await externalMe();
      if (m.principal_type !== principalType) {
        setError("Wrong portal for this session");
        setMe(null);
        return;
      }
      setMe(m);
    } catch (e) {
      setMe(null);
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [principalType]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const login = useCallback(
    async (args: { company_code: string; email: string; password: string }) => {
      const res: ExternalTokenResponse = await postExternalLogin({
        ...args,
        principal_type: principalType,
      });
      setExtAuth(res.access_token, res.refresh_token, res.tenant_id, res.principal_type);
      await refetch();
    },
    [principalType, refetch],
  );

  const logout = useCallback(async () => {
    try {
      if (getExtToken()) await externalLogout();
    } catch {
      /* ignore */
    }
    clearExtAuth();
    setMe(null);
  }, []);

  return { me, loading, error, refetch, login, logout };
}
