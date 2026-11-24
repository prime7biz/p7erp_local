import { useAuth } from "@/context/AuthContext";

/**
 * Tenant flag `inquiry_workbench_v1` (Settings → Configuration).
 * Strict: only an explicit `true` turns the new workbench UI on.
 */
export function isInquiryWorkbenchV1Enabled(featureFlags: unknown): boolean {
  return (
    typeof featureFlags === "object" &&
    featureFlags !== null &&
    (featureFlags as { inquiry_workbench_v1?: unknown }).inquiry_workbench_v1 === true
  );
}

/** Read the flag from the logged-in tenant (`me.feature_flags`). */
export function useInquiryWorkbenchV1(): boolean {
  const { me } = useAuth();
  return isInquiryWorkbenchV1Enabled(me?.feature_flags);
}
