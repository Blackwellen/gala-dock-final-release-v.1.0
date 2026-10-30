"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reports a sponsored slot as viewed once it has been at least 50% visible for one second (IAB-style viewability), with the
 * single-use token the server issued for this render. Nothing is counted on render, prefetch or by crawlers.
 */
function useViewBeacon(token: string, target: () => Element | null | undefined) {
  useEffect(() => {
    const el = target(); if (!el || !/^[0-9a-f]{36}$/.test(token) || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null, sent = false;
    const send = () => {
      if (sent) return; sent = true;
      const body = JSON.stringify({ t: token });
      if (!(navigator.sendBeacon && navigator.sendBeacon("/api/ads/view", new Blob([body], { type: "application/json" }))))
        void fetch("/api/ads/view", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && e.intersectionRatio >= 0.5) { if (!timer) timer = setTimeout(() => { send(); io.disconnect(); }, 1000); }
      else if (timer) { clearTimeout(timer); timer = null; }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [token]);   // eslint-disable-line react-hooks/exhaustive-deps
}

/** Wraps a sponsored card and reports it viewed. */
export function AdBeacon({ token, children, className, as: Tag = "div" }: { token: string; children: ReactNode; className?: string; as?: "div" | "li" | "article" }) {
  const ref = useRef<HTMLElement | null>(null);
  useViewBeacon(token, () => ref.current);
  return <Tag ref={ref as never} className={className} data-sponsored="true">{children}</Tag>;
}

/** Zero-layout marker placed inside an existing sponsored element (e.g. the Discover hero link); observes its parent. */
export function AdView({ token }: { token: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useViewBeacon(token, () => ref.current?.parentElement);
  return <span ref={ref} data-ad-view="true" hidden />;
}
