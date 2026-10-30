import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { TOOLS, TOOL, type Tool } from "@/lib/agent/registry";
import { invoke } from "@/lib/agent/runtime";
import { IdempotencyError, withIdempotency, type ServiceDb } from "@/lib/foundation";

/**
 * API + MCP gateway (release spec §95–99). One path for both channels: key → workspace + the human it acts as → scope check →
 * tool allowlist (the Gala Agent registry) → agent_invoke as that human. R4 commitments need a human approval in the app and R5 is
 * never exposed, so neither channel can do anything the person couldn't do themselves — and nothing consequential unattended.
 */
const DOMAIN: Record<string, string> = { events: "events", event: "events", task: "events", draft: "events", marketplace: "marketplace", opportunities: "marketplace", opportunity: "marketplace",
  reliability: "marketplace", tickets: "tickets", team: "teams", money: "finance", media: "media", message: "messages", quote: "quotes", venue: "availability", calendar: "availability",
  standby: "bookings", emergency: "bookings", cancellation: "bookings",
  // Q42/Q43 tools (lane D): granular scopes per domain (backend card 1.G). memory.* / mission.* are not exposed to API/MCP at all.
  compliance: "events", hospitality: "events", logistics: "events", partners: "events", virtual: "events", stock: "events", campaigns: "promotion", sales: "sales",
  comms: "messages", bookings: "bookings", listing: "listings", trust: "trust", crew: "teams", equipment: "bookings", availability: "availability" };
export const scopeFor = (t: Tool) => `${DOMAIN[t.id.split(".")[0]!] ?? "events"}:${t.risk === 0 ? "read" : "write"}`;
/** feed:read = the cursor event feed (GET /api/v1/events), same allow-listed payloads as webhooks. */
export const FEED_SCOPE = "feed:read";
export const ALL_SCOPES = [...new Set([...TOOLS.filter(t => t.risk <= 3).map(scopeFor), FEED_SCOPE])].sort();
/** API version (date-based). Requests may pin it with the Gala-Api-Version header; responses always carry it. */
export const API_VERSION = "2026-10-29";
export const SUPPORTED_VERSIONS = [API_VERSION];
/** Tool calls per minute per key are capped separately (an MCP batch counts each call). */
const CALLS_PER_MINUTE_CAP = 600;
/** Fields that never leave the platform through the API (ranking reasons/scores of the venue ranker). */
const RANKING_TOOLS = new Set(["venues.rank"]);
const stripRanking = (v: unknown): unknown => Array.isArray(v) ? v.map(stripRanking)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !/^(score|scores|reasons?|rank(ing)?_?.*|weights?)$/i.test(k)).map(([k, x]) => [k, stripRanking(x)])) : v;
export const exposed = (t: Tool) => t.risk <= 3;   // R4 needs in-app approval; R5 never leaves the platform

export type Caller = { keyId: string; workspaceId: string; actsAs: string; scopes: string[]; prefix: string; kind: "organizer" | "provider"; ratePerMinute: number };
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

export async function authenticate(req: Request): Promise<Caller> {
  const pinned = req.headers.get("gala-api-version");
  if (pinned && !SUPPORTED_VERSIONS.includes(pinned)) throw new ApiError(400, "unsupported_api_version", `Supported Gala-Api-Version values: ${SUPPORTED_VERSIONS.join(", ")}.`);
  const h = req.headers.get("authorization") ?? "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^gd_(live|test)_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/.test(key)) throw new ApiError(401, "invalid_api_key", "Provide a valid API key as a Bearer token.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const db = untyped(createAdminClient() as never);
  const { data } = await db.rpc("resolve_api_key", { p_hash: createHash("sha256").update(key).digest("hex"), p_ip: ip });
  const k = (data as { key_id: string; workspace_id: string; acts_as: string; scopes: string[]; prefix: string }[] | null)?.[0];
  if (!k) throw new ApiError(401, "invalid_api_key", "This API key is invalid, expired or revoked.");
  const [{ data: ws }, { data: lim }] = await Promise.all([db.from("workspaces").select("kind").eq("id", k.workspace_id).single(),
    db.from("api_keys").select("rate_limit_per_minute").eq("id", k.key_id).single()]);
  const ratePerMinute = Number((lim as { rate_limit_per_minute?: number } | null)?.rate_limit_per_minute ?? 120);
  if (!(await rateLimit(`api:${k.key_id}`, ratePerMinute, 60))) throw new ApiError(429, "rate_limited", `Rate limit exceeded (${ratePerMinute} requests per minute for this key).`);
  return { keyId: k.key_id, workspaceId: k.workspace_id, actsAs: k.acts_as, scopes: k.scopes, prefix: k.prefix, kind: (ws as { kind: "organizer" | "provider" }).kind, ratePerMinute };
}

export const toolsFor = (c: Caller) => TOOLS.filter(t => exposed(t) && (t.surface === "both" || t.surface === c.kind) && c.scopes.includes(scopeFor(t)));

export function describe(t: Tool) {
  return { name: t.id, title: t.title, description: t.description, risk: `R${t.risk}`, scope: scopeFor(t), mutation: t.mutation, idempotent: t.idempotent, input_schema: z.toJSONSchema(t.input) };
}

/**
 * Executes one tool for the caller; every call is logged with a request id. With an Idempotency-Key the call runs through
 * the canonical idempotency registry (Q03, withIdempotency): a replay returns the stored success response for 24h, the
 * same key with a different tool or input is a 409 conflict, a concurrent duplicate is a 409 in-progress, and a failed
 * call releases the key so it can be retried.
 */
export async function callTool(c: Caller, toolId: string, input: unknown, o: { channel: "rest" | "mcp"; requestId: string; idempotencyKey?: string | null; method: string; path: string }) {
  const db = untyped(createAdminClient() as never), t0 = Date.now();
  const tl = TOOL.get(toolId);
  const log = (status: number, response: unknown, errorCode?: string) => db.from("api_requests").insert({ request_id: o.requestId, key_id: c.keyId, workspace_id: c.workspaceId, channel: o.channel, method: o.method, path: o.path,
    tool: toolId, status, duration_ms: Date.now() - t0, idempotency_key: o.idempotencyKey ?? null, response: o.idempotencyKey && status === 200 ? response : null,
    error_code: errorCode ?? null, scope: tl ? scopeFor(tl) : null });
  const execute = async () => {
    const t = TOOL.get(toolId);
    if (!t || t.risk >= 5 || !(t.surface === "both" || t.surface === c.kind)) { await log(404, null, "unknown_tool"); throw new ApiError(404, "unknown_tool", `No tool named ${toolId}.`); }
    if (t.risk === 4) { await log(403, null, "approval_required"); throw new ApiError(403, "approval_required", "This action is a commitment and must be approved by a person in Gala Dock. Ask Gala Agent or use the app."); }
    if (!c.scopes.includes(scopeFor(t))) { await log(403, null, "insufficient_scope"); throw new ApiError(403, "insufficient_scope", `This key needs the ${scopeFor(t)} scope.`); }
    if (!(await rateLimit(`api-call:${c.keyId}`, Math.min(c.ratePerMinute, CALLS_PER_MINUTE_CAP), 60))) { await log(429, null, "rate_limited"); throw new ApiError(429, "rate_limited", "Too many tool calls for this key; retry after a minute."); }
    const shape = t.input.safeParse(input ?? {});
    if (!shape.success) { await log(422, null, "invalid_input"); throw new ApiError(422, "invalid_input", shape.error.issues.map(i => `${i.path.join(".")} ${i.message}`).join("; ").slice(0, 300)); }
    // Workspace binding: every id must belong to the key's workspace, even when the human also belongs to another workspace.
    const { data: bad, error: bindErr } = await db.rpc("api_tool_args_check", { p_workspace: c.workspaceId, p_kind: c.kind, p_args: (input ?? {}) as never });
    if (bindErr || bad) { await log(404, null, "not_found"); throw new ApiError(404, "not_found", bindErr ? "The request could not be checked." : `No ${String(bad).replace(/_id$/, "")} with that id in this workspace.`); }
    try {
      const raw = await invoke(c.actsAs, c.workspaceId, t, (input ?? {}) as Record<string, unknown>);
      const result = RANKING_TOOLS.has(t.id) ? stripRanking(raw) : raw;
      const body = { data: result, request_id: o.requestId };
      await log(200, body);
      return { status: 200, body };
    } catch (e) {
      const m = (e as Error).message;
      const [status, code] = /invalid_input/.test(m) ? [422, "invalid_input"] : /permission_denied|not_authorized|42501/.test(m) ? [403, "forbidden"] : /maintenance/.test(m) ? [503, "maintenance"] : /not_found|P0002/.test(m) ? [404, "not_found"] : [400, "rejected"];
      await log(status, null, code);
      throw new ApiError(status, code, status === 400 ? "The request was rejected by a business rule." : m.replace(/^invalid_input: /, "").slice(0, 300));
    }
  };
  if (!o.idempotencyKey) return { replayed: false, ...(await execute()) };
  if (!/^[\w-]{8,100}$/.test(o.idempotencyKey)) throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key must be 8–100 characters of letters, digits, - or _.");
  try {
    return await withIdempotency(db as unknown as ServiceDb, { scope: `api:${c.keyId}`, key: o.idempotencyKey, request: { tool: toolId, input: input ?? null }, workspaceId: c.workspaceId, actorId: c.actsAs }, execute);
  } catch (e) {
    if (e instanceof IdempotencyError) throw new ApiError(409, e.code, e.message);
    throw e;
  }
}

/** Audit row for authenticated non-tool calls (tool lists, MCP lifecycle methods, feed reads). */
export async function logRequest(c: Caller, o: { channel: "rest" | "mcp"; requestId: string; method: string; path: string; status: number; tool?: string | null; errorCode?: string | null; scope?: string | null }) {
  await untyped(createAdminClient() as never).from("api_requests").insert({ request_id: o.requestId, key_id: c.keyId, workspace_id: c.workspaceId, channel: o.channel, method: o.method,
    path: o.path, tool: o.tool ?? null, status: o.status, duration_ms: 0, error_code: o.errorCode ?? null, scope: o.scope ?? null });
}
export const versionHeaders = { "Gala-Api-Version": API_VERSION };
export const newRequestId = () => `req_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
export const errorBody = (e: ApiError, requestId: string) => ({ error: { code: e.code, message: e.message }, request_id: requestId });
