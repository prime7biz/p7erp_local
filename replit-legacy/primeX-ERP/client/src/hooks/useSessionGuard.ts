import { useEffect, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

export function useSessionGuard() {
  const validateSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        queryClient.clear();
        window.location.href = "/app/login";
      }
    } catch {
      // Network error - don't logout immediately, wait for reconnection
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("p7_active", "1");

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateSession();
      }
    };

    const handleOnline = () => {
      validateSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [validateSession]);
}
