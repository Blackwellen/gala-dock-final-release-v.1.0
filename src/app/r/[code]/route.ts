import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { untyped, isUuid } from "@/lib/workspace/db";
import { clientIp, hashToken } from "@/lib/security";

const CHANNELS = new Set(["direct", "instagram", "tiktok", "facebook", "x", "whatsapp", "email", "other"]);

/**
 * Promoter referral link: /r/<code>[?c=<channel>&a=<assetId>].
 * promoter_track_click (security definer) resolves the code to a public on-sale event, counts at most one click per
 * visitor per 30-minute window (plus a per-visitor hourly ceiling) and returns the event slug. Visitors are identified
 * only by a SHA-256 of ip + user agent — the raw IP is never stored. Unknown codes fall back to event discovery.
 */
export async function GET(request: Request, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  const fallback = NextResponse.redirect(new URL("/events", url), 307);
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(code)) return fallback;
  const channel = url.searchParams.get("c") ?? "direct";
  const asset = url.searchParams.get("a");
  const visitor = hashToken(`${clientIp(request)}|${request.headers.get("user-agent") ?? ""}|gd-ref`);
  const sb = untyped(await createClient());
  const { data } = await sb.rpc("promoter_track_click", { p_code: code, p_visitor: visitor, p_channel: CHANNELS.has(channel) ? channel : "other", p_asset: isUuid(asset) ? asset : null });
  const hit = (data as { slug: string; code: string; counted: boolean }[] | null)?.[0];
  if (!hit?.slug) return fallback;
  const target = new URL(`/events/${encodeURIComponent(hit.slug)}`, url);
  target.searchParams.set("ref", hit.code);
  // PECR: the referral cookie is not strictly necessary, so it is only set with the visitor's consent (remembered in gd_consent).
  const consent = request.headers.get("cookie")?.match(/(?:^|;\s*)gd_consent=([^;]+)/)?.[1] ?? "";
  if (!/referral:(yes|no)/.test(decodeURIComponent(consent))) {
    const ask = new URL(`/r/${encodeURIComponent(hit.code)}/consent`, url);
    ask.searchParams.set("event", hit.slug);
    const r = NextResponse.redirect(ask, 307);
    r.headers.set("Cache-Control", "private, no-store"); r.headers.set("Referrer-Policy", "no-referrer");
    return r;
  }
  const res = NextResponse.redirect(target, 307);
  // First-party attribution for checkout (30 days, readable by the server only) — only after consent.
  if (decodeURIComponent(consent).includes("referral:yes")) res.cookies.set("gd_ref", `${hit.code}:${hit.slug}`, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", maxAge: 30 * 86400, path: "/" });
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
