import { useEffect, useState } from "react";
import { APP_VERSION, getPlatformHealth } from "@/api/client";
import type { PlatformHealthResponse } from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { logApiError } from "@/utils/logApiError";

export function AppFooter({ showHealthDetails }: { showHealthDetails: boolean }) {
  const [now, setNow] = useState(new Date());
  const [health, setHealth] = useState<PlatformHealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  usePolling(
    async () => {
      try {
        setHealth(await getPlatformHealth());
        setHealthError(false);
      } catch (e) {
        logApiError("AppFooter.getPlatformHealth", e);
        setHealthError(true);
        throw e;
      }
    },
    { intervalMs: 60_000, enabled: showHealthDetails },
  );

  const systemStatusLabel = healthError ? "offline" : health?.status === "healthy" ? "healthy" : "degraded";
  const systemStatusClass =
    systemStatusLabel === "healthy"
      ? "text-status-success"
      : systemStatusLabel === "degraded"
        ? "text-status-warning"
        : "text-status-danger";
  const dbStatus = health?.components.database ?? "unknown";
  const redisStatus = health?.components.redis ?? "unknown";

  return (
    <footer className="flex h-9 items-center gap-4 border-t border-border bg-surface-raised px-4 text-xs text-text-muted md:px-5 lg:pr-20">
      <div className="shrink-0 font-medium text-text-secondary">
        Prime7 ERP · {now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      {showHealthDetails ? (
        <>
          <div className="shrink-0">
            System: <span className={`font-semibold ${systemStatusClass}`}>{systemStatusLabel}</span>
          </div>
          <div className="hidden items-center gap-3 truncate xl:flex">
            <span>DB: {dbStatus}</span>
            <span>Redis: {redisStatus}</span>
            <span>Env: {health?.environment ?? "unknown"}</span>
            <span>Version: {health?.version || APP_VERSION}</span>
          </div>
        </>
      ) : (
        <div className="hidden truncate sm:block">Company workspace</div>
      )}
    </footer>
  );
}
