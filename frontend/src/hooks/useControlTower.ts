import { useCallback, useState } from "react";

import {
  api,
  type ControlTowerCapacityHeatmapResponse,
  type ControlTowerLcSnapshotResponse,
  type ControlTowerSummaryResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function useControlTower() {
  const [summary, setSummary] = useState<ControlTowerSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const [heatmap, setHeatmap] = useState<ControlTowerCapacityHeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState("");

  const [lcSnapshot, setLcSnapshot] = useState<ControlTowerLcSnapshotResponse | null>(null);
  const [lcLoading, setLcLoading] = useState(false);
  const [lcError, setLcError] = useState("");

  const fetchSummary = useCallback(async (delivery_from: string, delivery_to: string, limit = 50, offset = 0) => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const res = await api.getControlTowerSummary({ delivery_from, delivery_to, limit, offset });
      setSummary(res);
    } catch (e) {
      logApiError(e, "useControlTower.fetchSummary");
      setSummaryError(e instanceof Error ? e.message : "Failed to load control tower summary");
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchHeatmap = useCallback(async (date_from: string, date_to: string) => {
    setHeatmapLoading(true);
    setHeatmapError("");
    try {
      const res = await api.getControlTowerCapacityHeatmap(date_from, date_to);
      setHeatmap(res);
    } catch (e) {
      logApiError(e, "useControlTower.fetchHeatmap");
      setHeatmapError(e instanceof Error ? e.message : "Failed to load capacity heatmap");
      setHeatmap(null);
    } finally {
      setHeatmapLoading(false);
    }
  }, []);

  const fetchLcSnapshot = useCallback(async (masterContractId: number) => {
    setLcLoading(true);
    setLcError("");
    try {
      const res = await api.getControlTowerMasterLcSnapshot(masterContractId);
      setLcSnapshot(res);
    } catch (e) {
      logApiError(e, "useControlTower.fetchLcSnapshot");
      setLcError(e instanceof Error ? e.message : "Failed to load master LC snapshot");
      setLcSnapshot(null);
    } finally {
      setLcLoading(false);
    }
  }, []);

  return {
    summary,
    summaryLoading,
    summaryError,
    fetchSummary,
    heatmap,
    heatmapLoading,
    heatmapError,
    fetchHeatmap,
    lcSnapshot,
    lcLoading,
    lcError,
    fetchLcSnapshot,
  };
}
