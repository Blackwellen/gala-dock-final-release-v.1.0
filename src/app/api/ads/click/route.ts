import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AD_DEST_RE, TOKEN_RE } from "@/lib/ads/core";
import { currentViewer } from "@/lib/ads/serve";

/**
 * Sponsored click (Q23): one counted click per served token, from the viewer it was served to, within 24 hours
 * (record_ad_click). The destination comes from the boost in the database, never from the URL, so this is not an open redirect.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  let dest = "/discover";
  if (TOKEN_RE.test(token)) {
    const v = await currentViewer();
    const { data } = await (createAdminClient() as unknown as { rpc(fn: string, a: Record<string, unknown>): PromiseLike<{ data: { href?: string } | null }> })
      .rpc("record_ad_click", { p_token: token, p_user: v.bot ? null : v.userId, p_anon: v.bot ? null : v.anon });
    if (data?.href && AD_DEST_RE.test(data.href)) dest = data.href;
  }
  return NextResponse.redirect(new URL(dest, url.origin), { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
