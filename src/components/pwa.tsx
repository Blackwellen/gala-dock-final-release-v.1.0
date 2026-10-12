"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Registers the static-asset service worker (production only) and re-validates the session on resume. */
export function PwaLifecycle() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    let live = true, registration: ServiceWorkerRegistration | undefined, installing: ServiceWorker | null = null;
    const changed = () => { if (installing?.state === "installed") queueMicrotask(() => { if (live && navigator.serviceWorker.controller && registration?.waiting) setUpdate(registration.waiting); }); };
    const found = () => { installing?.removeEventListener("statechange", changed); installing = registration?.installing ?? null; installing?.addEventListener("statechange", changed); };
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(r => {
        if (!live) return; registration = r; if (r.waiting) setUpdate(r.waiting); r.addEventListener("updatefound", found); if (r.installing) found();
      }).catch(() => undefined);
    }
    const sync = () => { setOffline(!navigator.onLine); if (navigator.onLine) router.refresh(); };
    const signout = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || new URL(form.action, location.href).pathname !== "/auth/signout") return;
      try { for (const key of Object.keys(localStorage)) if (key.startsWith("gd_design_")) localStorage.removeItem(key); } catch { /* storage unavailable */ }
    };
    // Returning to an installed app re-runs server checks so revoked access takes effect.
    let hiddenAt = 0;
    const resume = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (navigator.onLine && hiddenAt && Date.now() - hiddenAt > 60_000) router.refresh();
    };
    queueMicrotask(() => { if (live) setOffline(!navigator.onLine); });
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("submit", signout, true);
    return () => {
      live = false; registration?.removeEventListener("updatefound", found); installing?.removeEventListener("statechange", changed);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("submit", signout, true);
    };
  }, [router]);
  if (offline) return <div className="offline-banner" role="status">You’re offline. Changes can’t be saved until you reconnect.</div>;
  if (update) return <div className="offline-banner pwa-update" role="status"><span>An update is ready. Save your work before reloading.</span><button type="button" onClick={() => { navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true }); update.postMessage({ type: "ACTIVATE_UPDATE" }); }}>Reload to update</button></div>;
  return null;
}
