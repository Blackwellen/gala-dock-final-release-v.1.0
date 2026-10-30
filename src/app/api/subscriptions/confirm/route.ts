import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenHash } from "@/lib/comms/public";
import { untyped } from "@/lib/workspace/db";

const page = (title: string, body: string, form = "") => new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 16px}button{background:#6d4aff;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer}</style></head>
<body><h1>${title}</h1><p>${body}</p>${form}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const valid = (t: string | null): t is string => !!t && /^[A-Za-z0-9_-]{20,64}$/.test(t);

/** Double opt-in confirm / unsubscribe. GET only shows a button (mail link scanners must not confirm or unsubscribe); POST acts. */
export async function GET(request: Request) {
  const u = new URL(request.url), t = u.searchParams.get("token"), unsubscribe = u.searchParams.get("action") === "unsubscribe";
  if (!valid(t)) return page("Link not valid", "This link is incomplete or has expired.");
  return page(unsubscribe ? "Unsubscribe" : "Confirm your subscription", unsubscribe ? "Press the button to stop these emails." : "Press the button to start receiving these emails.",
    `<form method="post"><input type="hidden" name="token" value="${t}"><input type="hidden" name="action" value="${unsubscribe ? "unsubscribe" : "confirm"}"><button type="submit">${unsubscribe ? "Unsubscribe" : "Confirm"}</button></form>`);
}
export async function POST(request: Request) {
  const f = await request.formData().catch(() => null);
  const t = String(f?.get("token") ?? ""), unsubscribe = f?.get("action") === "unsubscribe";
  if (!valid(t)) return page("Link not valid", "This link is incomplete or has expired.");
  const { data } = await untyped(createAdminClient() as never).rpc(unsubscribe ? "marketing_unsubscribe" : "marketing_confirm", { p_token_hash: tokenHash(t) });
  const r = (data ?? {}) as { ok?: boolean };
  if (unsubscribe) return page("Unsubscribed", r.ok ? "You won’t receive these emails any more." : "We couldn’t find that subscription.");
  return page(r.ok ? "Subscription confirmed" : "Link not valid", r.ok ? "Thanks, you’re subscribed. Every email has an unsubscribe link." : "This link has expired. Subscribe again to get a new one.");
}
