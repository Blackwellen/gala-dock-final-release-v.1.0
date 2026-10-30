import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { ApiError, authenticate, errorBody, FEED_SCOPE, logRequest, newRequestId, versionHeaders } from "@/lib/developer/gateway";

/**
 * GET /api/v1/events?cursor=<opaque>&limit=1..500 — pull sync / webhook fallback (Q30). The key's workspace events in publish
 * order with the same public types and allow-listed payloads as webhooks. Persist `next_cursor` and pass it back; delivery is
 * at-least-once, so dedupe on `id`. Needs the feed:read scope.
 */
export async function GET(request: Request) {
  const rid = newRequestId();
  try {
    const c = await authenticate(request);
    if (!c.scopes.includes(FEED_SCOPE)) {
      await logRequest(c, { channel: "rest", requestId: rid, method: "GET", path: "/api/v1/events", status: 403, errorCode: "insufficient_scope", scope: FEED_SCOPE });
      throw new ApiError(403, "insufficient_scope", `This key needs the ${FEED_SCOPE} scope.`);
    }
    const u = new URL(request.url);
    const cursor = u.searchParams.get("cursor") ?? "0", limit = Number(u.searchParams.get("limit") ?? "100");
    if (!/^\d{1,18}$/.test(cursor)) throw new ApiError(400, "invalid_cursor", "cursor must be a value returned as next_cursor.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new ApiError(400, "invalid_limit", "limit must be 1–500.");
    const { data, error } = await untyped(createAdminClient() as never).rpc("api_event_feed", { p_workspace: c.workspaceId, p_after: cursor, p_limit: limit });
    if (error) throw new ApiError(500, "internal_error", "Something went wrong.");
    await logRequest(c, { channel: "rest", requestId: rid, method: "GET", path: "/api/v1/events", status: 200, scope: FEED_SCOPE });
    return NextResponse.json({ ...(data as object), request_id: rid }, { headers: { "X-Request-Id": rid, "Cache-Control": "no-store", ...versionHeaders } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "internal_error", "Something went wrong.");
    return NextResponse.json(errorBody(err, rid), { status: err.status, headers: { "X-Request-Id": rid, ...versionHeaders, ...(err.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
