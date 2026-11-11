/**
 * Installed-app updates (docs/mobile-feasibility/AUTOMATIC-UPDATE-STRATEGY.md, section 3).
 *
 * - Every launch loads fresh HTML from the server, so a reopened app is already on the new release.
 * - An app that stays open notices a new release through /version.json: when it becomes visible
 *   again, when the network returns, and every 10 minutes in the foreground.
 * - It switches to the new release only at a safe moment and never while a form has unsaved
 *   changes: back from the background after 5+ minutes, right after the next in-app page change
 *   (AppUpdateBanner), or "Reload now".
 *
 * Switched on with VITE_PWA_ENABLED=true at build time. When off, any service worker left from an
 * earlier build is removed (this is also the normal way to switch the feature off again).
 */
import { useSyncExternalStore } from "react";
import { APP_VERSION } from "@/api/models";
import { isAnyFormDirty, subscribeFormDirty } from "@/lib/unsavedChanges";
import { captureInstallPrompt } from "@/lib/pwa/installPrompt";

export const PWA_ENABLED = import.meta.env.VITE_PWA_ENABLED === "true";
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;
export const APPLY_ON_RESUME_AFTER_MS = 5 * 60 * 1000;
const CONTROLLER_CHANGE_TIMEOUT_MS = 3000;

type UpdateSnapshot = { available: boolean; version: string | null; formDirty: boolean };

let snapshot: UpdateSnapshot = { available: false, version: null, formDirty: false };
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | null = null;
let applying = false;

function update(next: Partial<UpdateSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

/** A different version string means "switch" (newer release or a rollback); "dev" builds never switch. */
export function isDifferentRelease(running: string, served: string | null | undefined): boolean {
  if (!served || !served.trim() || running === "dev") return false;
  return served.trim() !== running.trim();
}

export async function fetchServedVersion(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

/** Returns true when a new release is waiting to be used. Network problems are ignored. */
export async function checkForUpdate(fetchFn: typeof fetch = fetch): Promise<boolean> {
  void registration?.update().catch(() => undefined);
  const served = await fetchServedVersion(fetchFn);
  if (isDifferentRelease(APP_VERSION, served)) update({ available: true, version: served });
  return snapshot.available;
}

type ApplyDeps = {
  location?: Pick<Location, "assign" | "reload">;
  waitingWorker?: ServiceWorker | null;
  serviceWorker?: Pick<ServiceWorkerContainer, "addEventListener"> | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
};

/**
 * Load the new release (optionally at `targetUrl`). Refuses while a form has unsaved changes.
 * Reloads at most once, even if both the worker change and the timeout fire.
 */
export function applyUpdate(targetUrl?: string, deps: ApplyDeps = {}): boolean {
  if (applying || isAnyFormDirty()) return false;
  applying = true;
  const loc = deps.location ?? window.location;
  const waiting = deps.waitingWorker !== undefined ? deps.waitingWorker : registration?.waiting ?? null;
  const container = deps.serviceWorker !== undefined ? deps.serviceWorker : navigator.serviceWorker ?? null;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    if (targetUrl) loc.assign(targetUrl);
    else loc.reload();
  };
  if (waiting && container) {
    container.addEventListener("controllerchange", go, { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
    setTimer(go, CONTROLLER_CHANGE_TIMEOUT_MS);
  } else {
    go();
  }
  return true;
}

/** Back from the background: switch only if the app was away long enough and no form is dirty. */
export function shouldApplyOnResume(awayMs: number, available: boolean, formDirty: boolean): boolean {
  return available && !formDirty && awayMs >= APPLY_ON_RESUME_AFTER_MS;
}

/** Called once from main.tsx. Switching after an in-app page change is done by AppUpdateBanner. */
export function startMobileApp(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!PWA_ENABLED) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((all) => all.forEach((r) => void r.unregister()))
      .catch(() => undefined);
    return;
  }
  captureInstallPrompt();
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((r) => {
        registration = r;
      })
      .catch((e) => console.warn("Prime7 app: service worker registration failed", e));
  });

  let hiddenAt: number | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    void checkForUpdate().then((available) => {
      if (shouldApplyOnResume(awayMs, available, isAnyFormDirty())) applyUpdate();
    });
  });
  window.addEventListener("online", () => void checkForUpdate());
  window.setInterval(() => {
    if (document.visibilityState === "visible") void checkForUpdate();
  }, CHECK_INTERVAL_MS);
  subscribeFormDirty(() => update({ formDirty: isAnyFormDirty() }));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppUpdate(): UpdateSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Test helper: forget the "already applying" flag and the update state. */
export function resetAppUpdateForTests(): void {
  applying = false;
  registration = null;
  snapshot = { available: false, version: null, formDirty: false };
}
