import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/security";
import { TOKEN_RE } from "@/lib/ads/core";
import { currentViewer } from "@/lib/ads/serve";

/**
 * Verified sponsored impression (Q23). The slot's beacon posts the single-use token it was served with once the slot has been
 * at least half visible for one second. Counted only for the same viewer, once per token, within 30 minutes of serving,
 * deduped per viewer × boost × placement and rate-limited (record_ad_view). Always 204: the response reveals nothing.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 204 });
  const body = await request.text().catch(() => "");
  let token = "";
  try { token = String((JSON.parse(body) as { t?: unknown }).t ?? ""); } catch { token = ""; }
  if (TOKEN_RE.test(token)) {
    const v = await currentViewer();
    if (!v.bot) await (createAdminClient() as unknown as { rpc(fn: string, a: Record<string, unknown>): PromiseLike<unknown> })
      .rpc("record_ad_view", { p_token: token, p_user: v.userId, p_anon: v.anon });
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
