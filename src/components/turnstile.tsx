"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile bot check (release spec §73), used by sign-in, sign-up and password reset. Supabase Auth verifies the token
 * server-side when "Bot protection" is enabled for the project (scripts/auth-config.mjs). Renders nothing unless
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the forms work unchanged until it's configured.
 */
type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TS } }
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
let loading: Promise<void> | null = null;
const load = () => loading ??= new Promise<void>((res, rej) => {
  if (window.turnstile) return res();
  const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true;
  s.onload = () => res(); s.onerror = () => { loading = null; rej(new Error("turnstile")); }; document.head.appendChild(s);
});

export function Turnstile({ onToken, resetKey }: { onToken: (t: string) => void; resetKey?: number }) {
  const host = useRef<HTMLDivElement>(null), id = useRef<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let live = true;
    void load().then(() => {
      if (!live || !host.current || !window.turnstile) return;
      id.current = window.turnstile.render(host.current, { sitekey: TURNSTILE_SITE_KEY, theme: "light", appearance: "interaction-only",
        callback: (t: string) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    }).catch(() => onToken(""));
    return () => { live = false; if (id.current && window.turnstile) window.turnstile.remove(id.current); id.current = null; };
  }, [onToken]);
  // Tokens are single-use: reset after each submit attempt.
  useEffect(() => { if (resetKey && id.current && window.turnstile) { window.turnstile.reset(id.current); onToken(""); } }, [resetKey, onToken]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={host} className="auth-captcha" style={{ minHeight: 0 }} />;
}
