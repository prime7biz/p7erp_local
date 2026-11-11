/**
 * App-wide record of "a form on screen has unsaved changes".
 *
 * Pages mark themselves dirty through `useUnsavedChangesGuard` (hooks/useUnsavedChangesGuard.ts).
 * Anything that would reload the page on its own (new-version recovery in chunkReload.ts, the
 * mobile app update flow in lib/pwa) must check `isAnyFormDirty()` first and wait instead.
 */

const dirtySources = new Set<symbol>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function markFormDirty(source: symbol): void {
  if (dirtySources.has(source)) return;
  dirtySources.add(source);
  notify();
}

export function clearFormDirty(source: symbol): void {
  if (!dirtySources.delete(source)) return;
  notify();
}

export function isAnyFormDirty(): boolean {
  return dirtySources.size > 0;
}

/** Called whenever the answer of `isAnyFormDirty()` may have changed. Returns an unsubscribe function. */
export function subscribeFormDirty(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
