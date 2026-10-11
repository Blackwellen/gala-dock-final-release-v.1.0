import { NextResponse } from "next/server";
import { ApiError, authenticate, callTool, errorBody, newRequestId } from "@/lib/developer/gateway";

/** POST /api/v1/tools/{tool} — run one operation. Body: the tool's input object. Supports Idempotency-Key. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/tools/[tool]">) {
  const rid = newRequestId();
  try {
    const { tool } = await ctx.params;
    const c = await authenticate(request);
    const input = await request.json().catch(() => { throw new ApiError(400, "invalid_json", "The request body must be a JSON object."); });
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ApiError(400, "invalid_json", "The request body must be a JSON object.");
    const r = await callTool(c, tool, input, { channel: "rest", requestId: rid, idempotencyKey: request.headers.get("idempotency-key"), method: "POST", path: `/api/v1/tools/${tool}` });
    return NextResponse.json(r.body, { status: r.status, headers: { "X-Request-Id": rid, ...(r.replayed ? { "Idempotent-Replayed": "true" } : {}) } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "internal_error", "Something went wrong.");
    return NextResponse.json(errorBody(err, rid), { status: err.status, headers: { "X-Request-Id": rid, ...(err.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
