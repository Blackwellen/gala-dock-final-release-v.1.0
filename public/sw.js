// Gala Dock service worker.
// Caches only public, versioned static assets. Pages, auth flows and API responses are never
// cached, so private data never lands in the cache; navigations fall back to /offline.html.
const VERSION = "gd-static-v1";
const OFFLINE = "/offline.html";
const STATIC = [/^\/_next\/static\//, /^\/assets\//, /^\/icons\//, /^\/offline\.html$/];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return; // writes always go to the network and are never replayed
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Always fresh from the network so sessions and permissions are re-validated.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (STATIC.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    }));
  }
});
