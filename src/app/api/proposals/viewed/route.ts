import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { clientIp, rateLimit, sameOrigin } from "@/lib/security";
import { isPreviewBot, PROPOSAL_TOKEN } from "@/lib/share-links";
import { createHash } from "node:crypto";

const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Q16: the public proposal page beacons here after it has loaded and been visible, so "viewed" means a person opened it —
 * not a link-preview bot or mail scanner fetching the URL (the server render no longer marks it). mark_proposal_viewed is
 * service-only. Always answers 204 so the endpoint reveals nothing about the token.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request) || isPreviewBot(request.headers.get("user-agent")) || request.headers.get("sec-purpose")?.includes("prefetch")) return done();
  const body = await request.text().catch(() => "");
  let token = "";
  try { token = String((JSON.parse(body) as { token?: unknown }).token ?? ""); } catch { return done(); }
  if (!PROPOSAL_TOKEN.test(token)) return done();
  const ip = createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32);
  if (!(await rateLimit(`proposal-viewed:${ip}`, 30, 3600))) return done();
  await untyped(createAdminClient() as never).rpc("mark_proposal_viewed", { p_token: token });
  return done();
}
