"use client";

/**
 * Q37 Web Push registration (domain 233.1–233.2). Asks permission only from a user gesture, subscribes with the server's VAPID
 * public key and registers the subscription (bound server-side to the user and the current session). Returns a status the UI can
 * explain: unsupported | denied | not_configured (BLOCKED_EXTERNAL: no VAPID keys yet) | subscribed | error.
 */
export type PushStatus = "unsupported" | "denied" | "not_configured" | "subscribed" | "unsubscribed" | "error";

const b64ToBytes = (s: string) => { const p = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(p), c => c.charCodeAt(0)); };
const platform = () => /iPhone|iPad/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function enablePush(label = ""): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  const cfg = await fetch("/api/push/config", { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<{ publicKey?: string }> : null).catch(() => null);
  if (!cfg?.publicKey) return "not_configured";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.publicKey) });
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, platform: platform(), label }) });
    return res.ok ? "subscribed" : "error";
  } catch { return "error"; }
}

export async function disablePush(subscriptionId?: string): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    if (subscriptionId) await fetch(`/api/push/subscribe?id=${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
    return "unsubscribed";
  } catch { return "error"; }
}
