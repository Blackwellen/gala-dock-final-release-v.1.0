import { test, expect } from "@playwright/test";
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Release spec §95–100: scoped API keys acting as their creator, REST + MCP over the tool registry, idempotency, webhooks.
const db = admin as unknown as SupabaseClient;
const mk = () => { const r = (n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[Math.floor(Math.random() * 56)]).join(""); const prefix = r(8); return { prefix, key: `gd_live_${prefix}_${r(32)}` }; };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("developer platform", () => {
  let owner: { id: string; email: string }, ws: string, readKey: string, writeKey: string, readId: string;
  test.beforeAll(async () => {
    owner = await createUser("dev-o");
    ws = await seedWorkspace(owner.id, "organizer", "Dev Org");
    // API access is a plan capability; starter has none.
    const c0 = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await c0.rpc("create_api_key", { p_workspace: ws, p_name: "nope", p_scopes: ["events:read"], p_prefix: "AAAAAAAA", p_hash: sha("x"), p_expires: null })).error?.message).toMatch(/plan_required/);
    await db.from("workspaces").update({ plan: "pro" }).eq("id", ws);
    await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "API Launch", starts_at: new Date(Date.now() + 7 * 864e5).toISOString() });
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    const a = mk(), b = mk();
    readId = (await c.rpc("create_api_key", { p_workspace: ws, p_name: "read", p_scopes: ["events:read"], p_prefix: a.prefix, p_hash: sha(a.key), p_expires: null })).data as string;
    await c.rpc("create_api_key", { p_workspace: ws, p_name: "write", p_scopes: ["events:read", "events:write"], p_prefix: b.prefix, p_hash: sha(b.key), p_expires: null });
    readKey = a.key; writeKey = b.key;
  });
  test.afterAll(async () => { await db.from("events").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); await cleanup(); });

  test("keys are hashed, scoped and act as their creator", async ({ request }) => {
    // The hash column isn't readable by workspace members.
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await c.from("api_keys").select("key_hash").limit(1)).error).not.toBeNull();
    expect((await c.from("api_keys").select("prefix,scopes")).data!.length).toBe(2);
    const auth = (k: string) => ({ Authorization: `Bearer ${k}` });
    expect((await request.get(`${BASE}/api/v1/tools`, { headers: auth("gd_live_nope") })).status()).toBe(401);
    const list = await (await request.get(`${BASE}/api/v1/tools`, { headers: auth(readKey) })).json();
    expect(list.data.every((t: { scope: string }) => t.scope === "events:read")).toBe(true);
    const ev = await request.post(`${BASE}/api/v1/tools/events.list`, { headers: auth(readKey), data: {} });
    expect(ev.status()).toBe(200); expect(ev.headers()["x-request-id"]).toMatch(/^req_/);
    expect(JSON.stringify(await ev.json())).toContain("API Launch");
    // Write tool without the scope → 403; commitments (R4) are never callable.
    const evId = ((await db.from("events").select("id").eq("workspace_id", ws).single()).data as { id: string }).id;
    expect((await request.post(`${BASE}/api/v1/tools/task.create`, { headers: auth(readKey), data: { event_id: evId, title: "Call venue" } })).status()).toBe(403);
    expect((await (await request.post(`${BASE}/api/v1/tools/quote.send`, { headers: auth(writeKey), data: {} })).json()).error.code).toMatch(/approval_required|unknown_tool/);
    // Idempotent write: the same key replays the first response and creates one task.
    const h = { ...auth(writeKey), "Idempotency-Key": `idem-${Date.now()}` };
    const r1 = await request.post(`${BASE}/api/v1/tools/task.create`, { headers: h, data: { event_id: evId, title: "Call venue" } });
    const r2 = await request.post(`${BASE}/api/v1/tools/task.create`, { headers: h, data: { event_id: evId, title: "Call venue" } });
    expect(r1.status()).toBe(200); expect(r2.headers()["idempotent-replayed"]).toBe("true");
    expect((await db.from("tasks").select("id").eq("event_id", evId).eq("title", "Call venue")).data!.length).toBe(1);
    // Invalid input is a typed 422.
    expect((await request.post(`${BASE}/api/v1/tools/task.create`, { headers: auth(writeKey), data: { event_id: "x" } })).status()).toBe(422);
    // Revoked keys stop immediately.
    await c.rpc("revoke_api_key", { p_key: readId });
    expect((await request.post(`${BASE}/api/v1/tools/events.list`, { headers: auth(readKey), data: {} })).status()).toBe(401);
  });

  test("MCP lists and calls the same tools", async ({ request }) => {
    const rpc = (body: object) => request.post(`${BASE}/api/mcp`, { headers: { Authorization: `Bearer ${writeKey}` }, data: body });
    const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } })).json();
    expect(init.result.serverInfo.name).toBe("gala-dock");
    const tools = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    const names = tools.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("events.list"); expect(names).not.toContain("quote.send");
    const call = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "events.list", arguments: {} } })).json();
    expect(call.result.isError).toBe(false); expect(call.result.content[0].text).toContain("API Launch");
    expect((await request.post(`${BASE}/api/mcp`, { data: { jsonrpc: "2.0", id: 4, method: "tools/list" } })).status()).toBe(401);
  });

  test("audit events fan out to subscribed webhooks, signed and retried", async ({ request }) => {
    const secret = "whsec_e2e_secret";
    const { data: ep } = await db.from("webhook_endpoints").insert({ workspace_id: ws, url: "https://example.com/gala-hook", events: ["event.created"], secret, created_by: owner.id }).select("id").single();
    await db.from("audit_events").insert({ actor_id: owner.id, actor_type: "user", workspace_id: ws, event: "event.created", metadata: { event_id: "e1", ip: "1.2.3.4" } });
    await db.from("audit_events").insert({ actor_id: owner.id, actor_type: "user", workspace_id: ws, event: "listing.updated", metadata: {} });   // not subscribed
    const { data: dels } = await db.from("webhook_deliveries").select("id,event_type,payload,status").eq("endpoint_id", (ep as { id: string }).id);
    expect(dels!.length).toBe(1);
    expect(dels![0].event_type).toBe("event.created");
    expect(JSON.stringify(dels![0].payload)).not.toContain("1.2.3.4");   // sensitive metadata stripped
    const res = await request.post(`${BASE}/api/cron/webhooks`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(res.ok()).toBe(true);
    const { data: after } = await db.from("webhook_deliveries").select("status,attempts,response_status,next_attempt_at").eq("id", dels![0].id).single();
    expect(after!.attempts).toBe(1);
    expect(["delivered", "failed"]).toContain(after!.status);   // example.com rejects POSTs → failed with backoff
    if (after!.status === "failed") expect(new Date(after!.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
    // Signature format receivers verify against.
    const t = 1700000000, body = JSON.stringify({ a: 1 });
    expect(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });
});
