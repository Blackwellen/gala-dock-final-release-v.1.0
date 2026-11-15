import { NextResponse } from "next/server";

/** Q75: legacy sponsored-click URL, retired. Sponsored clicks are counted by GET /api/ads/click?t= (single-use served token);
 *  this path only exists so links in pages cached before the deploy still land somewhere. It records nothing (the anon
 *  record_boost_event RPC is revoked post-deploy, supabase/pending/q75_retire_legacy_boost_rpcs.sql) and only redirects to a
 *  same-site /events/<slug> page, so it can't be used as an open redirect. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "/discover";
  const target = /^\/events\/[a-z0-9-]{1,120}$/i.test(to) ? to : "/discover";
  return NextResponse.redirect(new URL(target, url.origin), 302);
}
