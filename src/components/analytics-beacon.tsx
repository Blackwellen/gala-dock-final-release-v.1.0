"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics/client";

/**
 * Q35 page usage (223.1): one `page.viewed` per client navigation, route template only (ids/tokens/query stripped before
 * sending and again on the server). Installed-app launches and offline use are tagged for Q37 device analytics.
 */
export function AnalyticsBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    const surface = path.split("/")[1] || "home";
    track({ name: "page.viewed", path, props: { surface } });
    if (!navigator.onLine) track({ name: "pwa.offline_used", path, props: { surface } });
  }, [path]);
  useEffect(() => {
    const installed = () => track({ name: "pwa.installed", props: { platform: /iPhone|iPad/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop" } });
    addEventListener("appinstalled", installed);
    return () => removeEventListener("appinstalled", installed);
  }, []);
  return null;
}
