/*
 * Prime7 ERP service worker (docs/mobile-feasibility/AUTOMATIC-UPDATE-STRATEGY.md).
 *
 * Kept deliberately small. The server decides which app version runs: pages (HTML) always come
 * from the network and are never stored here. This worker only
 *   - shows /offline.html when there is no connection,
 *   - keeps hashed /assets/* files (they never change) so an open app can still load its pages,
 * and it never touches API calls, files, or anything sent with a login token.
 *
 * Keep this file name. Change CACHE_VERSION only when the caching rules below change.
 */
const CACHE_VERSION = "v1";
const OFFLINE_CACHE = `p7-offline-${CACHE_VERSION}`;
const ASSET_CACHE = `p7-assets-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_FILES = [OFFLINE_URL, "/icons/icon-192.png"];
const MAX_ASSET_ENTRIES = 600;
const NEVER_HANDLE = [
  "/api/",
  "/media/",
  "/health",
  "/iclock/",
  "/version.json",
  "/sw.js",
  "/downloads/",
  "/.well-known/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([OFFLINE_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("p7-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// The app asks the waiting worker to take over only at a safe moment (no unsaved form).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function trimAssetCache(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSET_ENTRIES; i += 1) await cache.delete(keys[i]);
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Never keep an HTML error or maintenance page under a hashed asset name.
  const isHtml = (response.headers.get("content-type") || "").includes("text/html");
  if (response.ok && response.type === "basic" && !isHtml) {
    await cache.put(request, response.clone());
    await trimAssetCache(cache);
  }
  return response;
}

async function networkFirstPage(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.headers.has("Authorization")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_HANDLE.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirstAsset(request));
  }
});
