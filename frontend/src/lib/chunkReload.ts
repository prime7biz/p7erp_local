/**
 * Recover when a deploy replaced the JavaScript files an open tab still points to.
 *
 * Page code is split into hashed files (e.g. VouchersPage-ab12.js). After a new release those old
 * files are gone, so opening a page in a tab loaded before the release fails with
 * "Failed to fetch dynamically imported module". The fix is simply to reload the page once.
 *
 * - `installChunkErrorRecovery()` (called in main.tsx) listens for Vite's `vite:preloadError`
 *   and reloads once per browser-tab session.
 * - Hover prefetches (`app/prefetchRoutes.ts`) must never reload the page under the user, so they
 *   run inside `runPrefetch()` and their failures are only logged.
 * - If the reload already happened and it still fails, error boundaries show a
 *   "new version available" message (see `isChunkLoadError`).
 */

import { isAnyFormDirty } from "@/lib/unsavedChanges";

const RELOAD_KEY = "p7_chunk_reload_done";
let prefetchesInFlight = 0;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
];

export function isChunkLoadError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(text));
}

/**
 * Reload the tab unless we already did so for a chunk error in this session, or a form on screen
 * has unsaved changes (then the "new version" message asks the user to save first).
 * Returns true if reloading.
 */
export function reloadOnceForNewVersion(): boolean {
  if (isAnyFormDirty()) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No sessionStorage (private mode): reloading without a guard could loop, so do not reload.
    return false;
  }
  window.location.reload();
  return true;
}

/** Run a background prefetch; while it runs, chunk errors are not treated as "reload now". */
export function runPrefetch(load: () => Promise<unknown>): Promise<unknown> {
  prefetchesInFlight += 1;
  return load().finally(() => {
    prefetchesInFlight -= 1;
  });
}

export function installChunkErrorRecovery(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    if (prefetchesInFlight > 0) {
      // A hover prefetch failed: do not interrupt the user; the real navigation will retry.
      return;
    }
    if (reloadOnceForNewVersion()) event.preventDefault();
  });
}
