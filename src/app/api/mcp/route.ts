import { NextResponse } from "next/server";
import { ApiError, authenticate, callTool, logRequest, newRequestId, toolsFor, scopeFor, versionHeaders } from "@/lib/developer/gateway";
import { z } from "zod";

/**
 * Gala Dock MCP server (release spec §99) — Streamable HTTP transport, stateless JSON responses, JSON-RPC 2.0.
 * Auth: workspace API key as Bearer. Tools are the same typed registry Gala Agent uses, filtered by scope, workspace type and
 * exposure rules; calls execute as the key's creator. Tool results are returned as JSON text content.
 */
const PROTOCOL = "2025-06-18";
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
const tier = (risk: number) => risk === 0 ? "basic" : risk <= 2 ? "medium" : "advanced";

export async function POST(request: Request) {
  const rid = newRequestId();
  let caller;
  try { caller = await authenticate(request); }
  catch (e) { const err = e as ApiError; return NextResponse.json(fail(null, -32001, err.message ?? "Unauthorized"), { status: err.status ?? 401, headers: { "WWW-Authenticate": "Bearer" } }); }
  const body = await request.json().catch(() => null) as Rpc | Rpc[] | null;
  if (!body) return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  const handle = async (m: Rpc) => {
    if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m.id, -32600, "Invalid Request");
    if (m.method !== "tools/call" && m.method !== "notifications/initialized") await logRequest(caller, { channel: "mcp", requestId: rid, method: "POST", path: `/api/mcp#${m.method.slice(0, 40)}`, status: 200 });
    switch (m.method) {
      case "initialize": return ok(m.id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gala-dock", version: "1.0.0" },
        instructions: "Gala Dock workspace tools. Calls run with the permissions of the API key's creator. Commitments require approval in the Gala Dock app." });
      case "notifications/initialized": return null;
      case "ping": return ok(m.id, {});
      case "tools/list": return ok(m.id, { tools: toolsFor(caller).map(t => ({ name: t.id, title: t.title, description: `${t.description} (${tier(t.risk)} · R${t.risk} · scope ${scopeFor(t)})`,
        inputSchema: z.toJSONSchema(t.input), annotations: { readOnlyHint: t.risk === 0, destructiveHint: false, idempotentHint: t.idempotent, openWorldHint: t.risk >= 3 } })) });
      case "tools/call": {
        const name = String(m.params?.name ?? ""), args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        // Idempotency for mutating calls: the Idempotency-Key header (single call) or params._meta["idempotency-key"] (per call in a batch).
        const meta = (m.params?._meta ?? {}) as Record<string, unknown>;
        const idem = typeof meta["idempotency-key"] === "string" ? String(meta["idempotency-key"]) : Array.isArray(body) ? null : request.headers.get("idempotency-key");
        try {
          const r = await callTool(caller, name, args, { channel: "mcp", requestId: rid, method: "POST", path: "/api/mcp", idempotencyKey: idem });
          return ok(m.id, { content: [{ type: "text", text: JSON.stringify((r.body as { data: unknown }).data) }], isError: false });
        } catch (e) {
          if (e instanceof ApiError && (e.code === "unknown_tool")) return fail(m.id, -32602, e.message);
          return ok(m.id, { content: [{ type: "text", text: e instanceof ApiError ? `${e.code}: ${e.message}` : "The tool failed." }], isError: true });
        }
      }
      default: return m.id === undefined ? null : fail(m.id, -32601, `Method not found: ${m.method}`);
    }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 20).map(handle))).filter(Boolean);
    return out.length ? NextResponse.json(out, { headers: { "X-Request-Id": rid, ...versionHeaders } }) : new NextResponse(null, { status: 202 });
  }
  const out = await handle(body);
  return out ? NextResponse.json(out, { headers: { "X-Request-Id": rid, "Mcp-Protocol-Version": PROTOCOL, ...versionHeaders } }) : new NextResponse(null, { status: 202 });
}

export async function GET() {
  return NextResponse.json({ error: "This MCP server uses stateless JSON responses; POST JSON-RPC messages to this URL." }, { status: 405, headers: { Allow: "POST" } });
}
