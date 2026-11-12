import { useAuth } from "@/context/AuthContext";
import { isMobileUiV2Enabled, PHONE_MEDIA_QUERY, type FeatureFlags } from "@/lib/mobileUi";
import { useMediaQuery } from "@/hooks/useInventoryListView";

/**
 * True when this tenant switched on the simpler phone / tablet layout (`mobile_ui_v2`).
 * Shared form controls also render outside the signed-in app (and in tests without an AuthProvider);
 * there the switch simply counts as off.
 */
export function useMobileUiV2(): boolean {
  let flags: FeatureFlags;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useAuth reads the context before it can throw, so hook order never changes
    flags = useAuth().me?.feature_flags;
  } catch {
    flags = undefined;
  }
  return isMobileUiV2Enabled(flags);
}

/** `mobile_ui_v2` is on and the screen is phone-sized (below 768px); follows rotation live. */
export function useMobileUiV2Phone(): boolean {
  const enabled = useMobileUiV2();
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  return enabled && phone;
}
