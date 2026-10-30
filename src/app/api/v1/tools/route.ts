import { NextResponse } from "next/server";
import { ApiError, authenticate, describe, errorBody, logRequest, newRequestId, toolsFor, versionHeaders } from "@/lib/developer/gateway";

/** GET /api/v1/tools — the operations this key can call (scope ∩ workspace type ∩ exposure rules), with JSON Schemas. */
export async function GET(request: Request) {
  const rid = newRequestId();
  try {
    const c = await authenticate(request);
    await logRequest(c, { channel: "rest", requestId: rid, method: "GET", path: "/api/v1/tools", status: 200 });
    return NextResponse.json({ data: toolsFor(c).map(describe), workspace_id: c.workspaceId, request_id: rid }, { headers: { "X-Request-Id": rid, "Cache-Control": "no-store", ...versionHeaders } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "internal_error", "Something went wrong.");
    return NextResponse.json(errorBody(err, rid), { status: err.status, headers: { "X-Request-Id": rid, ...versionHeaders, ...(err.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
