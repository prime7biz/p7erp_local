import { useAuth } from "@/context/AuthContext";

/**
 * Tenant flag `quotation_costing_accuracy_v1` (Settings -> Configuration -> More).
 * Strict: only an explicit `true` turns the dozen-first costing controls on.
 */
export function isQuotationCostingAccuracyV1Enabled(featureFlags: unknown): boolean {
  return (
    typeof featureFlags === "object" &&
    featureFlags !== null &&
    (featureFlags as { quotation_costing_accuracy_v1?: unknown }).quotation_costing_accuracy_v1 === true
  );
}

/** Read the flag from the logged-in tenant (`me.feature_flags`). */
export function useQuotationCostingAccuracyV1(): boolean {
  const { me } = useAuth();
  return isQuotationCostingAccuracyV1Enabled(me?.feature_flags);
}
