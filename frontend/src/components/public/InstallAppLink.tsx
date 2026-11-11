import { Link } from "react-router-dom";
import { Download, Smartphone } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { ANDROID_APK_URL } from "@/lib/pwa/androidApp";
import { PWA_ENABLED } from "@/lib/pwa/appUpdate";
import { detectInstallPlatform, isRunningAsInstalledApp } from "@/lib/pwa/installPrompt";

export const INSTALL_PAGE_PATH = "/install";

type Props = {
  /** Where the link sits, for analytics (for example "landing_explore", "login_footer"). */
  from: string;
  label?: string;
  className: string;
};

/** The app is offered for Android (and desktop browsers) only; iPhone visitors see no install links for now. */
function shouldOfferApp(): boolean {
  return PWA_ENABLED && !isRunningAsInstalledApp() && detectInstallPlatform() !== "ios";
}

/**
 * Shortcut to the "Install the mobile app" page. Hidden when the mobile app is switched off
 * (VITE_PWA_ENABLED), on iPhone / iPad, or when the page already runs as the installed app.
 */
export function InstallAppLink({ from, label = "Get the mobile app", className }: Props) {
  if (!shouldOfferApp()) return null;
  return (
    <Link
      to={INSTALL_PAGE_PATH}
      onClick={() => trackEvent("cta_click", { cta: "install_app", from })}
      className={className}
    >
      <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

/** Direct download of the Android app file (APK). Hidden until VITE_ANDROID_APK_URL is set. */
export function AndroidApkLink({ from, label = "Download Android app", className }: Props) {
  if (!shouldOfferApp() || !ANDROID_APK_URL) return null;
  return (
    <a
      href={ANDROID_APK_URL}
      download
      onClick={() => trackEvent("cta_click", { cta: "android_apk_download", from })}
      className={className}
    >
      <Download className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </a>
  );
}
