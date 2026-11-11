/**
 * "Install the app" support for the /install page and the landing / login shortcuts.
 *
 * Android Chrome (and Edge, Samsung Internet) fire `beforeinstallprompt` when the site can be
 * installed. We keep that event so the Install button can open the real install dialog after a tap.
 * iPhone Safari never fires it; the Install page shows the Share → Add to Home Screen steps instead.
 */
import { useSyncExternalStore } from "react";
import { isAppleMobileDevice } from "@/lib/fileSave";

export type InstallPlatform = "ios" | "android" | "desktop";
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallSnapshot = { canPrompt: boolean; installedNow: boolean };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let snapshot: InstallSnapshot = { canPrompt: false, installedNow: false };
const listeners = new Set<() => void>();

function update(next: Partial<InstallSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export function captureInstallPrompt(target: Pick<Window, "addEventListener"> = window): void {
  target.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    update({ canPrompt: true });
  });
  target.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    update({ canPrompt: false, installedNow: true });
  });
}

/** Opens the browser's own install dialog. Only works right after a user tap. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  deferredPrompt = null;
  update({ canPrompt: false });
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === "accepted") update({ installedNow: true });
  return choice.outcome;
}

/** True when this page is running as the installed home-screen app (no browser bars). */
export function isRunningAsInstalledApp(win: Window = window): boolean {
  const standaloneMedia = typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

type NavigatorLike = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">;

export function detectInstallPlatform(nav: NavigatorLike = navigator): InstallPlatform {
  if (isAppleMobileDevice(nav)) return "ios";
  if (/Android/i.test(nav.userAgent || "")) return "android";
  return "desktop";
}

/** Chrome, Firefox, Edge or Opera on iPhone: Add to Home Screen is easiest from Safari. */
export function isIosOtherBrowser(userAgent: string = navigator.userAgent): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallPrompt(): InstallSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
