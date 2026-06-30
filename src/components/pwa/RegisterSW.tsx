"use client";

import { useEffect } from "react";

/** Registers the PWA service worker in production (V1-6). No-op in dev to avoid cache churn. */
export function RegisterSW() {
  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal */
      });
    }
  }, []);
  return null;
}
