"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Registers the static-asset service worker (production only) and re-validates the session on resume. */
export function PwaLifecycle() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const sync = () => setOffline(!navigator.onLine);
    // Returning to an installed app re-runs server checks so revoked access takes effect.
    let hiddenAt = 0;
    const resume = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (navigator.onLine && hiddenAt && Date.now() - hiddenAt > 60_000) router.refresh();
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [router]);
  if (!offline) return null;
  return <div className="offline-banner" role="status">You’re offline. Changes can’t be saved until you reconnect.</div>;
}
