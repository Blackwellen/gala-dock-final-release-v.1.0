// Gala Dock service worker (Q37 re-verified 2026-10-29).
// Caches only public, versioned static assets. Pages, auth flows, token pages, API responses and anything cross-origin
// (Stripe, Supabase, maps) are never cached, so private data never lands in the Cache Storage; navigations fall back to
// /offline.html. Offline data the user chose to keep (ticket passes, run sheets, job sheets) lives in IndexedDB, written by
// the page (src/lib/pwa/offline-store.ts) and cleared on sign-out — never by this worker.
const VERSION = "gd-static-v3";
const OFFLINE = "/offline.html";
const STATIC = [/^\/_next\/static\//, /^\/assets\//, /^\/icons\//, /^\/brand\//, /^\/fonts\//, /^\/offline\.html$/];
// Defence in depth: these are never served from or written to the cache even if a STATIC rule ever matched them.
const NEVER = [/^\/api\//, /^\/auth\//, /^\/admin/, /^\/(pay|portal|p|proposal|contract|contracts|rsvp|invite|invites|r|ref|guest|share|t|reset-password)(\/|$)/, /\/print(\/|$)/];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll([OFFLINE, "/icons/icon-192.png"])));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("gd-static-") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Updates wait for the user: the page shows "Reload to update" and posts ACTIVATE_UPDATE.
self.addEventListener("message", event => { if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting(); });

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return; // writes always go to the network and are never replayed by the worker
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Stripe, Supabase, maps, analytics: browser default, never cached
  if (NEVER.some(pattern => pattern.test(url.pathname))) {
    if (request.mode === "navigate") event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

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
      const cacheable = response.ok && response.type === "basic" && !/no-store|private/.test(response.headers.get("Cache-Control") ?? "");
      if (cacheable) { try { await cache.put(request, response.clone()); } catch { /* Quota/storage failure must not block a successful network response. */ } }
      return response;
    }));
  }
});

// Background sync (Q37, offline scanner): the scanner registers "gd-scan-sync" when it queues offline scans. When connectivity
// returns the browser wakes this worker, which asks open scanner pages to flush their queue through the normal, permission-checked
// sync endpoint. The worker never holds scan data or credentials itself.
self.addEventListener("sync", event => {
  if (event.tag !== "gd-scan-sync") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => { for (const c of list) c.postMessage({ type: "SYNC_SCANS" }); }));
});

// Web Push (Q37 readiness; delivery needs VAPID keys). Payloads carry only a short title/body and a same-origin path — never private
// details, because notifications appear on lock screens.
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 60) : "Gala Dock";
  const path = typeof data.url === "string" && /^\/(?!\/)/.test(data.url) ? data.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body.slice(0, 140) : "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag.slice(0, 64) : undefined, requireInteraction: data.critical === true, data: { url: path },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.url ?? "/";
  const target = new URL(/^\/(?!\/)/.test(path) ? path : "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    if (open) { open.focus(); return open.navigate ? open.navigate(target) : undefined; }
    return self.clients.openWindow(target);
  }));
});
// The push service rotated the subscription: tell open pages to re-register it (the server binds it to the user's session).
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => { for (const c of list) c.postMessage({ type: "PUSH_RESUBSCRIBE" }); }));
});
