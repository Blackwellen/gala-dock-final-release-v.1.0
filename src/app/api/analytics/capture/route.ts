import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit, sameOrigin } from "@/lib/security";
import { capture, consentFor, cookieConsent, currentUserId, deviceClass, visitorHash } from "@/lib/analytics/server";
import { correlationId } from "@/lib/foundation";
import type { TrackInput } from "@/lib/analytics/events";

/**
 * Q35 product-analytics capture (anonymous-capable, same-origin). The service role is used server-side only; nothing here is an
 * anon-callable SQL function. Always 204 so the response reveals nothing. Limits: 16 KB body, 50 events per call, 120 calls per
 * visitor per minute and 600 per user per minute. Do Not Track / Global Privacy Control → nothing is stored.
 */
const NO_CONTENT = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NO_CONTENT();
  if (request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return NO_CONTENT();
  const text = await request.text().catch(() => "");
  if (!text || text.length > 16_384) return NO_CONTENT();
  let body: { events?: TrackInput[]; standalone?: boolean; workspaceId?: string };
  try { body = JSON.parse(text); } catch { return NO_CONTENT(); }
  if (!Array.isArray(body.events) || !body.events.length) return NO_CONTENT();

  const vh = visitorHash(request);
  if (!(await rateLimit(`analytics:v:${vh.slice(0, 32)}`, 120, 60))) return NO_CONTENT();
  const userId = await currentUserId();
  if (userId && !(await rateLimit(`analytics:u:${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`, 600, 60))) return NO_CONTENT();

  const consent = userId ? await consentFor(userId) : cookieConsent(request.headers.get("cookie"));
  const ref = request.headers.get("referer");
  let refHost = "";
  try { refHost = ref ? new URL(ref).host : ""; } catch { refHost = ""; }
  if (refHost === new URL(request.url).host) refHost = "";
  const utm: Record<string, string> = {};
  try {
    const q = ref ? new URL(ref).searchParams : null;
    for (const k of ["source", "medium", "campaign"]) { const v = q?.get(`utm_${k}`); if (v) utm[k] = v; }
  } catch { /* ignore */ }

  try {
    await capture(body.events, { userId, consent, visitorHash: vh, workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : null,
      device: deviceClass(request.headers.get("user-agent")), standalone: body.standalone === true, refHost, utm, correlationId: correlationId(request.headers) });
  } catch { /* analytics never fails the caller */ }
  return NO_CONTENT();
}
