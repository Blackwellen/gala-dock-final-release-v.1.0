import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { TOOLS, TOOL, type Tool } from "@/lib/agent/registry";
import { invoke } from "@/lib/agent/runtime";

/**
 * API + MCP gateway (release spec §95–99). One path for both channels: key → workspace + the human it acts as → scope check →
 * tool allowlist (the Gala Agent registry) → agent_invoke as that human. R4 commitments need a human approval in the app and R5 is
 * never exposed, so neither channel can do anything the person couldn't do themselves — and nothing consequential unattended.
 */
const DOMAIN: Record<string, string> = { events: "events", event: "events", task: "events", draft: "events", marketplace: "marketplace", opportunities: "marketplace", opportunity: "marketplace",
  reliability: "marketplace", tickets: "tickets", team: "teams", money: "finance", media: "media", message: "messages", quote: "quotes", venue: "availability", calendar: "availability",
  standby: "bookings", emergency: "bookings", cancellation: "bookings" };
export const scopeFor = (t: Tool) => `${DOMAIN[t.id.split(".")[0]!] ?? "events"}:${t.risk === 0 ? "read" : "write"}`;
export const ALL_SCOPES = [...new Set(TOOLS.filter(t => t.risk <= 3).map(scopeFor))].sort();
export const exposed = (t: Tool) => t.risk <= 3;   // R4 needs in-app approval; R5 never leaves the platform

export type Caller = { keyId: string; workspaceId: string; actsAs: string; scopes: string[]; prefix: string; kind: "organizer" | "provider" };
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

export async function authenticate(req: Request): Promise<Caller> {
  const h = req.headers.get("authorization") ?? "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^gd_(live|test)_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/.test(key)) throw new ApiError(401, "invalid_api_key", "Provide a valid API key as a Bearer token.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const db = untyped(createAdminClient() as never);
  const { data } = await db.rpc("resolve_api_key", { p_hash: createHash("sha256").update(key).digest("hex"), p_ip: ip });
  const k = (data as { key_id: string; workspace_id: string; acts_as: string; scopes: string[]; prefix: string }[] | null)?.[0];
  if (!k) throw new ApiError(401, "invalid_api_key", "This API key is invalid, expired or revoked.");
  if (!(await rateLimit(`api:${k.key_id}`, 120, 60))) throw new ApiError(429, "rate_limited", "Rate limit exceeded (120 requests per minute per key).");
  const { data: ws } = await db.from("workspaces").select("kind").eq("id", k.workspace_id).single();
  return { keyId: k.key_id, workspaceId: k.workspace_id, actsAs: k.acts_as, scopes: k.scopes, prefix: k.prefix, kind: (ws as { kind: "organizer" | "provider" }).kind };
}

export const toolsFor = (c: Caller) => TOOLS.filter(t => exposed(t) && (t.surface === "both" || t.surface === c.kind) && c.scopes.includes(scopeFor(t)));

export function describe(t: Tool) {
  return { name: t.id, title: t.title, description: t.description, risk: `R${t.risk}`, scope: scopeFor(t), mutation: t.mutation, idempotent: t.idempotent, input_schema: z.toJSONSchema(t.input) };
}

/** Executes one tool for the caller. Idempotency keys replay the stored response for 24h; every call is logged with a request id. */
export async function callTool(c: Caller, toolId: string, input: unknown, o: { channel: "rest" | "mcp"; requestId: string; idempotencyKey?: string | null; method: string; path: string }) {
  const db = untyped(createAdminClient() as never), t0 = Date.now();
  const log = (status: number, response: unknown) => db.from("api_requests").insert({ request_id: o.requestId, key_id: c.keyId, workspace_id: c.workspaceId, channel: o.channel, method: o.method, path: o.path,
    tool: toolId, status, duration_ms: Date.now() - t0, idempotency_key: o.idempotencyKey ?? null, response: o.idempotencyKey ? response : null });
  if (o.idempotencyKey) {
    if (!/^[\w-]{8,100}$/.test(o.idempotencyKey)) throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key must be 8–100 characters of letters, digits, - or _.");
    const { data: prior } = await db.from("api_requests").select("status,response,tool").eq("key_id", c.keyId).eq("idempotency_key", o.idempotencyKey).gt("created_at", new Date(Date.now() - 864e5).toISOString()).maybeSingle();
    if (prior) { if ((prior as { tool: string }).tool !== toolId) throw new ApiError(409, "idempotency_conflict", "This Idempotency-Key was used for a different operation."); return { replayed: true, status: (prior as { status: number }).status, body: (prior as { response: unknown }).response }; }
  }
  const t = TOOL.get(toolId);
  if (!t || t.risk >= 5 || !(t.surface === "both" || t.surface === c.kind)) { await log(404, null); throw new ApiError(404, "unknown_tool", `No tool named ${toolId}.`); }
  if (t.risk === 4) { await log(403, null); throw new ApiError(403, "approval_required", "This action is a commitment and must be approved by a person in Gala Dock. Ask Gala Agent or use the app."); }
  if (!c.scopes.includes(scopeFor(t))) { await log(403, null); throw new ApiError(403, "insufficient_scope", `This key needs the ${scopeFor(t)} scope.`); }
  try {
    const result = await invoke(c.actsAs, c.workspaceId, t, (input ?? {}) as Record<string, unknown>);
    const body = { data: result, request_id: o.requestId };
    await log(200, body);
    return { replayed: false, status: 200, body };
  } catch (e) {
    const m = (e as Error).message;
    const [status, code] = /invalid_input/.test(m) ? [422, "invalid_input"] : /permission_denied|not_authorized|42501/.test(m) ? [403, "forbidden"] : /maintenance/.test(m) ? [503, "maintenance"] : /not_found|P0002/.test(m) ? [404, "not_found"] : [400, "rejected"];
    await log(status, { error: { code } });
    throw new ApiError(status, code, status === 400 ? "The request was rejected by a business rule." : m.replace(/^invalid_input: /, "").slice(0, 300));
  }
}

export const newRequestId = () => `req_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
export const errorBody = (e: ApiError, requestId: string) => ({ error: { code: e.code, message: e.message }, request_id: requestId });
