import { useRef } from "react";
import { api, type AiForecastRunResponse } from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { logApiError } from "@/utils/logApiError";

const ACTIVE = new Set(["PENDING", "RUNNING"]);

/**
 * Polls `GET /forecast-runs/{id}` while the run is still in-flight, so the list updates
 * when the backend completes a previously async run. Pauses while the tab is hidden and
 * backs off when the request keeps failing.
 */
export function usePollWhilePending(
  run: AiForecastRunResponse | null,
  onRefreshed: (r: AiForecastRunResponse) => void,
) {
  const onRef = useRef(onRefreshed);
  onRef.current = onRefreshed;
  const runId = run?.id ?? null;
  const pending = run != null && ACTIVE.has(String(run.status).toUpperCase());

  usePolling(
    async () => {
      if (runId == null) return;
      try {
        onRef.current(await api.aiGetForecastRun(runId));
      } catch (e) {
        logApiError("usePollWhilePending.aiGetForecastRun", e);
        throw e;
      }
    },
    { intervalMs: 3000, enabled: pending, maxBackoffMs: 60_000, runImmediately: false },
  );
}
