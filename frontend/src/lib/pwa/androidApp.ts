/**
 * Android app download links (docs/mobile-feasibility/RECOMMENDED-IMPLEMENTATION-PLAN.md).
 *
 * Set at build time; an empty value hides that button, so nothing shows before the file or listing exists:
 * - VITE_ANDROID_APK_URL: the Google-signed APK we host, e.g. /downloads/prime7erp-android.apk
 * - VITE_PLAY_STORE_URL: the Google Play page, e.g. https://play.google.com/store/apps/details?id=com.prime7erp.app
 */

/** Same-site path ("/downloads/...") or an https:// address; anything else is ignored. */
export function safeDownloadUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https:\/\/[^\s]+$/i.test(value)) return value;
  return "";
}

/** Only Google Play addresses are accepted for the Play button. */
export function safePlayStoreUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return /^https:\/\/play\.google\.com\/[^\s]*$/i.test(value) ? value : "";
}

export const ANDROID_APK_URL = safeDownloadUrl(import.meta.env.VITE_ANDROID_APK_URL as string | undefined);
export const PLAY_STORE_URL = safePlayStoreUrl(import.meta.env.VITE_PLAY_STORE_URL as string | undefined);
