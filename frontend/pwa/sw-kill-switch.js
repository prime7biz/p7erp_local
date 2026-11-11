/*
 * EMERGENCY ONLY: replaces /sw.js to remove the Prime7 service worker from every device.
 *
 * Use when a broken worker must be removed quickly. Copy this file over frontend/public/sw.js,
 * build and deploy (docs/mobile-feasibility/AUTOMATIC-UPDATE-STRATEGY.md, section 3.8).
 * Simpler first choice: rebuild with VITE_PWA_ENABLED=false; the app then unregisters the
 * worker by itself. Pages are never cached by the worker, so nobody is stuck on an old version.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("p7-")) await caches.delete(name);
      }
      await self.registration.unregister();
    })(),
  );
});
