/**
 * Tenant switch `mobile_ui_v2` (Settings → Configuration → "Simpler mobile layout").
 * Strict: only an explicit `true` turns it on; missing, false or any other value keeps today's layout.
 */
export type FeatureFlags = Record<string, boolean | string | number | null> | null | undefined;

export function isMobileUiV2Enabled(featureFlags: FeatureFlags): boolean {
  return featureFlags?.mobile_ui_v2 === true;
}

/** Same width as Tailwind's `md` breakpoint: below it counts as a phone. */
export const PHONE_MEDIA_QUERY = "(max-width: 767px)";
