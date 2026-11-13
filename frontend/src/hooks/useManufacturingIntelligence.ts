import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/core";
import {
  manufacturingIntelligenceApi as mi,
  type CapacityResponse,
  type DeliveryPredictionResponse,
  type LineLoadingResponse,
  type MfgDateWindow,
  type MfgSummaryResponse,
  type ReadinessResponse,
} from "@/api/manufacturingIntelligence";
import { logApiError } from "@/utils/logApiError";

export interface MfgResource<T> {
  data: T | null;
  loading: boolean;
  error: string;
  /** HTTP status of the last failed load (e.g. 403 / 404), else null. */
  errorStatus: number | null;
  reload: () => void;
}

/**
 * Small load-on-change hook. A newer request always wins (stale answers are ignored).
 * `key` must change whenever the inputs change; `load` may be null to stay idle.
 */
export function useMfgResource<T>(scope: string, key: string, load: (() => Promise<T>) | null): MfgResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const fn = loadRef.current;
    const id = ++seq.current;
    if (!fn) {
      setData(null);
      setLoading(false);
      setError("");
      setErrorStatus(null);
      return;
    }
    setLoading(true);
    setError("");
    setErrorStatus(null);
    fn()
      .then((res) => {
        if (id === seq.current) setData(res);
      })
      .catch((e: unknown) => {
        logApiError(scope, e);
        if (id !== seq.current) return;
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
        setErrorStatus(e instanceof ApiError ? e.status : null);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    return () => {
      // Invalidate this request when inputs change or the component unmounts.
      if (seq.current === id) seq.current += 1;
    };
  }, [scope, key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, errorStatus, reload };
}

const wkey = (w: MfgDateWindow) => `${w.date_from}|${w.date_to}|${w.factory_unit ?? ""}|${w.line_id ?? ""}`;

export function useMfgSummary(w: MfgDateWindow, enabled: boolean) {
  return useMfgResource<MfgSummaryResponse>(
    "useMfgSummary",
    wkey(w),
    enabled ? () => mi.getSummary({ date_from: w.date_from, date_to: w.date_to, factory_unit: w.factory_unit }) : null,
  );
}

export function useMfgCapacity(w: MfgDateWindow, enabled: boolean) {
  return useMfgResource<CapacityResponse>("useMfgCapacity", wkey(w), enabled ? () => mi.getCapacity(w) : null);
}

export function useMfgLineLoading(w: MfgDateWindow, enabled: boolean) {
  return useMfgResource<LineLoadingResponse>("useMfgLineLoading", wkey(w), enabled ? () => mi.getLineLoading(w) : null);
}

export function useMfgReadiness(orderId: number | null) {
  return useMfgResource<ReadinessResponse>(
    "useMfgReadiness",
    String(orderId ?? ""),
    orderId != null ? () => mi.getReadiness(orderId) : null,
  );
}

export function useMfgDeliveryPrediction(orderId: number | null) {
  return useMfgResource<DeliveryPredictionResponse>(
    "useMfgDeliveryPrediction",
    String(orderId ?? ""),
    orderId != null ? () => mi.getDeliveryPrediction(orderId) : null,
  );
}
