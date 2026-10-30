import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentViewer } from "@/lib/ads/serve";

/**
 * Campaign UTM link (Q23, domain 139/145): records one touch per visitor per link per 30 minutes (record_campaign_touch,
 * service-only, rate-limited) and redirects to the campaign's internal destination from the database — never from the URL,
 * so this is not an open redirect. Bots are redirected without a touch.
 */
const CODE_RE = /^[a-z0-9]{10}$/;
const DEST_RE = /^\/(events|organizers|venues|series|p)\/[A-Za-z0-9\-_]{1,120}(\?utm_source=[a-z0-9\-_]+&utm_medium=[a-z0-9\-_]+&utm_campaign=[a-z0-9\-_]+)?$/;

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  let dest = "/discover";
  if (CODE_RE.test(code)) {
    const v = await currentViewer();
    const { data } = await (createAdminClient() as unknown as { rpc(fn: string, a: Record<string, unknown>): PromiseLike<{ data: { destination?: string } | null }> })
      .rpc("record_campaign_touch", { p_code: code, p_visitor_hash: v.bot ? "" : (v.anon ?? v.userId ?? ""), p_user: v.bot ? null : v.userId });
    if (data?.destination && DEST_RE.test(data.destination)) dest = data.destination;
  }
  return NextResponse.redirect(new URL(dest, url.origin), { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}
