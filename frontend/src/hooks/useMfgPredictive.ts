import {
  mfgPredictiveApi as mpr,
  type AnomaliesResponse,
  type CalibrationResponse,
  type DeliveryForecastResponse,
  type LineEfficiencyResponse,
  type RecommendationsResponse,
  type RecommendationStatusFilter,
  type SupplierLatenessResponse,
} from "@/api/mfgPredictive";

import { useMfgResource } from "./useManufacturingIntelligence";

/** Manufacturing Intelligence Phase 4 (predictions) loaders. `null` / `enabled=false` keeps a hook idle. */

export function useMfgDeliveryForecast(orderId: number | null) {
  return useMfgResource<DeliveryForecastResponse>(
    "useMfgDeliveryForecast",
    String(orderId ?? ""),
    orderId != null ? () => mpr.getDeliveryForecast(orderId) : null,
  );
}

export function useMfgLineEfficiency(params: { date_to?: string; factory_unit?: string }, enabled: boolean) {
  return useMfgResource<LineEfficiencyResponse>(
    "useMfgLineEfficiency",
    `${params.date_to ?? ""}|${params.factory_unit ?? ""}`,
    enabled ? () => mpr.getLineEfficiency(params) : null,
  );
}

export function useMfgSupplierLateness(enabled: boolean) {
  return useMfgResource<SupplierLatenessResponse>("useMfgSupplierLateness", "all", enabled ? () => mpr.getSupplierLateness() : null);
}

export function useMfgAnomalies(params: { date_from: string; date_to: string; factory_unit?: string }, enabled: boolean) {
  return useMfgResource<AnomaliesResponse>(
    "useMfgAnomalies",
    `${params.date_from}|${params.date_to}|${params.factory_unit ?? ""}`,
    enabled ? () => mpr.getAnomalies(params) : null,
  );
}

export function useMfgCalibration(enabled: boolean) {
  return useMfgResource<CalibrationResponse>("useMfgCalibration", "c", enabled ? () => mpr.getCalibration() : null);
}

export function useMfgRecommendations(params: { status: RecommendationStatusFilter; kind?: string }, enabled: boolean) {
  return useMfgResource<RecommendationsResponse>(
    "useMfgRecommendations",
    `${params.status}|${params.kind ?? ""}`,
    enabled ? () => mpr.listRecommendations({ status: params.status, kind: params.kind, limit: 100 }) : null,
  );
}
