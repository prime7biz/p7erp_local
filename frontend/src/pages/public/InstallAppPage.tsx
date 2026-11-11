import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, MoreVertical, ShieldCheck, Smartphone, Store } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { ANDROID_APK_URL, PLAY_STORE_URL } from "@/lib/pwa/androidApp";
import {
  detectInstallPlatform,
  isRunningAsInstalledApp,
  promptInstall,
  useInstallPrompt,
  type InstallPlatform,
} from "@/lib/pwa/installPrompt";

/**
 * Public "Install the mobile app" page (/install), opened from the landing page and the login page.
 * Android only for now. Shows only installation help: no company, login or account data.
 */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-semibold text-brand-primary">
        {n}
      </span>
      <span className="pt-0.5 text-text-secondary">{children}</span>
    </li>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface-raised p-5 sm:p-6">
      <h2 id={id} className="text-lg font-semibold text-text-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

const primaryButton =
  "inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-brand-primary px-6 font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-60";

export function InstallAppPage() {
  const { canPrompt, installedNow } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [platform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [alreadyApp] = useState(() => isRunningAsInstalledApp());

  async function onInstall() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10">
          <Smartphone className="h-7 w-7 text-brand-primary" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Prime7 ERP for Android
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-text-secondary">
          Install the app on your Android phone or tablet. It opens full screen and updates itself whenever we release a
          new version. Your company code and login stay the same.
        </p>
      </div>

      {platform === "ios" ? (
        <p role="note" className="mt-8 rounded-xl border border-border bg-surface-subtle p-4 text-center text-sm text-text-secondary">
          The Prime7 ERP app is available for Android. On iPhone and iPad, keep using{" "}
          <Link to="/login" className="font-medium text-brand-primary hover:underline">
            prime7erp.com
          </Link>{" "}
          in Safari.
        </p>
      ) : null}

      {alreadyApp || installedNow ? (
        <div role="status" className="mt-8 flex items-start gap-3 rounded-xl border border-status-success/30 bg-status-success-subtle p-4 text-status-success-foreground">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{alreadyApp ? "You are using the Prime7 ERP app." : "Installed. Open Prime7 ERP from your home screen."}</p>
            <Link to="/login" className="mt-1 inline-block text-sm font-medium underline">
              Go to sign in
            </Link>
          </div>
        </div>
      ) : null}

      {platform !== "ios" ? (
        <div className="mt-8 space-y-6">
          {PLAY_STORE_URL ? (
            <Card id="install-play" title="Google Play">
              <p className="mt-2 text-sm text-text-secondary">The easiest way: install and update through the Play Store.</p>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("cta_click", { cta: "play_store", from: "install_page" })}
                className={`mt-4 ${primaryButton}`}
              >
                <Store className="h-5 w-5" aria-hidden />
                Get it on Google Play
              </a>
            </Card>
          ) : null}

          {ANDROID_APK_URL ? (
            <Card id="install-apk" title="Download the app file (APK)">
              <a
                href={ANDROID_APK_URL}
                download
                onClick={() => trackEvent("cta_click", { cta: "android_apk_download", from: "install_page" })}
                className={`mt-4 ${PLAY_STORE_URL ? "inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-brand-primary px-6 font-semibold text-brand-primary hover:bg-brand-primary/5" : primaryButton}`}
              >
                <Download className="h-5 w-5" aria-hidden />
                Download Android app
              </a>
              <ol className="mt-4 space-y-3 text-sm">
                <Step n={1}>Open the downloaded file <strong>prime7erp-android.apk</strong>.</Step>
                <Step n={2}>
                  If Android asks, allow <strong>Install unknown apps</strong> for your browser or file manager (only once).
                </Step>
                <Step n={3}>Tap <strong>Install</strong>, then open <strong>Prime7 ERP</strong> and sign in.</Step>
              </ol>
              <p className="mt-4 flex items-start gap-2 text-xs text-text-muted">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                Download the app only from prime7erp.com or Google Play. It is the same app, signed by Google.
              </p>
            </Card>
          ) : null}

          <Card id="install-chrome" title={PLAY_STORE_URL || ANDROID_APK_URL ? "Or install from Chrome" : "Install from Chrome"}>
            {canPrompt ? (
              <div className="mt-4">
                <button type="button" onClick={() => void onInstall()} disabled={busy} className={primaryButton}>
                  <Download className="h-5 w-5" aria-hidden />
                  Install Prime7 ERP
                </button>
                <p className="mt-2 text-sm text-text-muted">Then tap Install in the window that opens.</p>
              </div>
            ) : null}
            <ol className="mt-4 space-y-3 text-sm">
              <Step n={1}>Open this page in <strong>Chrome</strong>.</Step>
              <Step n={2}>
                Tap the menu <MoreVertical className="inline h-4 w-4 align-text-bottom" aria-label="three dots" /> and choose{" "}
                <strong>Install app</strong> (on some phones: <strong>Add to home screen</strong>).
              </Step>
              <Step n={3}>Open <strong>Prime7 ERP</strong> from your home screen and sign in.</Step>
            </ol>
            <p className="mt-4 text-xs text-text-muted">Computers: Chrome or Edge show an install icon at the right end of the address bar.</p>
          </Card>
        </div>
      ) : null}

      <p className="mt-8 text-center text-sm text-text-muted">
        Updates arrive automatically. If a form is open, the app waits until you save.{" "}
        <Link to="/login" className="font-medium text-brand-primary hover:underline">
          Sign in
        </Link>
        {" · "}
        <Link to="/account-deletion" className="font-medium text-brand-primary hover:underline">
          Delete my account
        </Link>
      </p>
    </div>
  );
}
