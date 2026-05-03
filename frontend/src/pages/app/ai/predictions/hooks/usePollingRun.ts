import { useEffect, useRef } from "react";
import { api, type AiForecastRunResponse } from "@/api/client";

const ACTIVE = new Set(["PENDING", "RUNNING"]);

/**
 * Polls `GET /forecast-runs/{id}` while the run is still in-flight, so the list updates
 * when the backend completes a previously async run.
 */
export function usePollWhilePending(
  run: AiForecastRunResponse | null,
  onRefreshed: (r: AiForecastRunResponse) => void,
) {
  const onRef = useRef(onRefreshed);
  onRef.current = onRefreshed;

  useEffect(() => {
    if (!run || !ACTIVE.has(String(run.status).toUpperCase())) return;
    const id = setInterval(() => {
      void (async () => {
        try {
          const f = await api.aiGetForecastRun(run.id);
          onRef.current(f);
        } catch {
          /* ignore */
        }
      })();
    }, 3000);
    return () => clearInterval(id);
  }, [run?.id, run?.status]);
}
