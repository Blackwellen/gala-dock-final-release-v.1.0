"use client";
import { useEffect } from "react";

/** Q16: tells the server a person actually opened the proposal (page loaded and visible for a moment). Bots that only fetch the HTML never run this. */
export function ViewedBeacon({ token }: { token: string }) {
  useEffect(() => {
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      const body = JSON.stringify({ token });
      if (!navigator.sendBeacon?.("/api/proposals/viewed", new Blob([body], { type: "application/json" })))
        void fetch("/api/proposals/viewed", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    };
    const t = window.setTimeout(send, 1500);
    const onVis = () => { if (document.visibilityState === "visible") window.setTimeout(send, 1500); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearTimeout(t); document.removeEventListener("visibilitychange", onVis); };
  }, [token]);
  return null;
}
