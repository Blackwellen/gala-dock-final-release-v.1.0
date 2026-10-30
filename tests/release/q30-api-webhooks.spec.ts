import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { signPayload, verifySignature } from "../../src/lib/developer/signature";
import { WEBHOOK_TYPES, DENIED_FIELD } from "../../src/lib/developer/webhook-catalogue";

// Q30 API / MCP / webhooks / sync (domains 189–194, 283–285) — API-level (HTTP to the dev server + RLS clients), disposable identities.
// Exit gate: an external client cannot exceed the authenticated workspace scope (key workspace × key scopes × the human's role).
// No AI runs (only SQL-backed registry tools are called), no outbound webhook leaves the machine (targets are TEST-NET IPs the SSRF
// guard refuses before any connection).
type U = { id: string; email: string };
type Id = { id: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const B62 = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const mk = () => { const r = (n: number) => Array.from({ length: n }, () => B62[Math.floor(Math.random() * B62.length)]).join(""); const prefix = r(8); return { prefix, key: `gd_live_${prefix}_${r(32)}` }; };
const auth = (k: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${k}`, ...extra });
const call = (r: APIRequestContext, k: string, tool: string, data: object, h: Record<string, string> = {}) => r.post(`${BASE}/api/v1/tools/${tool}`, { headers: auth(k, h), data });
const mcp = (r: APIRequestContext, k: string, body: object, h: Record<string, string> = {}) => r.post(`${BASE}/api/mcp`, { headers: auth(k, h), data: body });

test.describe.configure({ mode: "serial" });

test.describe("Q30 developer API, MCP, webhooks and feed", () => {
  let O: U, Mg: U, F: U; let oc: SupabaseClient, mgc: SupabaseClient;
  let A: string, B: string, EA: string, EB: string, TB: string;
  let keyA = "", keyAid = "", mgKey = "", mgKeyId = "", feedKey = "";

  const newKey = async (c: SupabaseClient, ws: string, scopes: string[], name = "q30") => {
    const k = mk();
    const r = await c.rpc("create_api_key", { p_workspace: ws, p_name: name, p_scopes: scopes, p_prefix: k.prefix, p_hash: sha(k.key), p_expires: null });
    if (r.error) throw new Error(r.error.message);
    return { key: k.key, id: r.data as string };
  };

  test.beforeAll(async () => {
    [O, Mg, F] = await Promise.all([createUser("q30-owner"), createUser("q30-mgr"), createUser("q30-fin")]);
    A = await seedWorkspace(O.id, "organizer", "Q30 Org A");
    B = await seedWorkspace(O.id, "organizer", "Q30 Org B");   // same human owns both workspaces
    await db.from("workspaces").update({ plan: "pro" }).in("id", [A, B]);
    await db.from("workspace_members").insert([{ workspace_id: A, user_id: Mg.id, role: "manager", status: "active" }, { workspace_id: A, user_id: F.id, role: "finance", status: "active" }]);
    EA = ((await db.from("events").insert({ owner_id: O.id, workspace_id: A, name: "Q30 Event A", starts_at: new Date(Date.now() + 9 * 864e5).toISOString() }).select("id").single()).data as Id).id;
    EB = ((await db.from("events").insert({ owner_id: O.id, workspace_id: B, name: "Q30 Event B secret", starts_at: new Date(Date.now() + 9 * 864e5).toISOString() }).select("id").single()).data as Id).id;
    TB = ((await db.from("ticket_tiers").insert({ event_id: EB, name: "B tier", price: 0, quantity: 10, status: "draft" }).select("id").single()).data as Id).id;
    [oc, mgc] = await Promise.all([as(O), as(Mg)]);
    ({ key: keyA, id: keyAid } = await newKey(oc, A, ["events:read", "events:write", "finance:read"]));
    ({ key: mgKey, id: mgKeyId } = await newKey(mgc, A, ["events:read", "events:write", "finance:read"], "mgr"));
    ({ key: feedKey } = await newKey(oc, A, ["feed:read"], "feed"));
  });
  test.afterAll(async () => {
    await db.from("api_requests").delete().in("workspace_id", [A, B]);
    await db.from("webhook_deliveries").delete().in("workspace_id", [A, B]);
    await db.from("webhook_endpoints").delete().in("workspace_id", [A, B]);
    await db.from("api_keys").delete().in("workspace_id", [A, B]);
    await db.from("events").delete().in("workspace_id", [A, B]);
    await db.from("workspaces").delete().in("id", [A, B]);
    await cleanup();
  });

  test("cross-workspace denial: a key for A can't touch B's records even though the same human owns B", async ({ request }) => {
    { const r0 = await call(request, keyA, "event.readiness", { event_id: EA }); expect(r0.status(), await r0.text()).toBe(200); }
    for (const [tool, input] of [["event.readiness", { event_id: EB }], ["event.feasibility", { event_id: EB }], ["event.budget", { event_id: EB }],
      ["task.create", { event_id: EB, title: "Sneak" }], ["map.validate", { event_id: EB }]] as const) {
      const r = await call(request, keyA, tool, input);
      expect(r.status(), tool).toBe(404);
      expect(JSON.stringify(await r.json())).not.toContain("secret");
    }
    expect((await db.from("tasks").select("id").eq("event_id", EB)).data).toEqual([]);
    const list = await (await call(request, keyA, "events.list", {})).json();
    expect(JSON.stringify(list)).toContain("Q30 Event A");
    expect(JSON.stringify(list)).not.toContain("Q30 Event B");
    // MCP is the same gateway.
    const m = await (await mcp(request, keyA, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "event.readiness", arguments: { event_id: EB } } })).json();
    expect(m.result.isError).toBe(true); expect(m.result.content[0].text).toMatch(/^not_found/);
    expect((await call(request, keyA, "tickets.publish_tier", { tier_id: TB })).status()).toBe(403);   // R4 never callable
    expect((await db.from("ticket_tiers").select("status").eq("id", TB).single()).data?.status).toBe("draft");
  });

  test("least privilege: scope AND the human's current role both apply; removal kills the key", async ({ request }) => {
    expect((await call(request, mgKey, "money.payables", {})).status()).toBe(200);
    await db.from("workspace_members").update({ role: "member" }).eq("workspace_id", A).eq("user_id", Mg.id);   // member lacks finance.read
    const r = await call(request, mgKey, "money.payables", {});
    expect(r.status()).toBe(403); expect((await r.json()).error.code).toBe("forbidden");
    expect((await call(request, mgKey, "task.create", { event_id: EA, title: "Member can write tasks" })).status()).toBe(200);
    await db.from("workspace_members").update({ status: "revoked" }).eq("workspace_id", A).eq("user_id", Mg.id);
    expect((await call(request, mgKey, "events.list", {})).status()).toBe(401);
    // A key never lists tools above its scopes / R3, and the finance user can't create keys at all.
    const tools = (await (await request.get(`${BASE}/api/v1/tools`, { headers: auth(keyA) })).json()).data as { name: string; scope: string; risk: string }[];
    expect(tools.every(t => ["events:read", "events:write", "finance:read"].includes(t.scope) && t.risk !== "R4")).toBe(true);
    const fc = await as(F);
    expect((await fc.rpc("create_api_key", { p_workspace: A, p_name: "fin", p_scopes: ["finance:read"], p_prefix: "AAAAAAAA", p_hash: sha("f"), p_expires: null })).error?.message).toMatch(/not_authorized/);
    void mgKeyId;
  });

  test("per-key rate limit, audit of every call, idempotency over REST and MCP", async ({ request }) => {
    const { key, id } = await newKey(oc, A, ["events:read", "events:write"], "limited");
    await db.from("api_keys").update({ rate_limit_per_minute: 3 }).eq("id", id);
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await request.get(`${BASE}/api/v1/tools`, { headers: auth(key) })).status());
    expect(codes).toEqual([200, 200, 200, 429]);
    const logs = (await db.from("api_requests").select("path,status,error_code,scope,channel").eq("key_id", keyAid)).data as { path: string; status: number; error_code: string | null }[];
    expect(logs.some(l => l.status === 404 && l.error_code === "not_found")).toBe(true);
    expect(logs.some(l => l.path === "/api/v1/tools/event.readiness" && l.status === 200)).toBe(true);
    await request.get(`${BASE}/api/v1/tools`, { headers: auth(keyA) });
    await mcp(request, keyA, { jsonrpc: "2.0", id: 9, method: "tools/list" });
    const after = (await db.from("api_requests").select("path,channel").eq("key_id", keyAid)).data as { path: string; channel: string }[];
    expect(after.some(l => l.path === "/api/v1/tools")).toBe(true);
    expect(after.some(l => l.channel === "mcp" && l.path === "/api/mcp#tools/list")).toBe(true);
    // Idempotency: MCP per-call _meta key replays one task.
    const idem = `q30-mcp-${Date.now()}`;
    const body = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "task.create", arguments: { event_id: EA, title: "MCP idempotent" }, _meta: { "idempotency-key": idem } } };
    expect((await (await mcp(request, keyA, body)).json()).result.isError).toBe(false);
    expect((await (await mcp(request, keyA, body)).json()).result.isError).toBe(false);
    expect((await db.from("tasks").select("id").eq("event_id", EA).eq("title", "MCP idempotent")).data!.length).toBe(1);
    const conflict = await (await mcp(request, keyA, { ...body, params: { ...body.params, arguments: { event_id: EA, title: "Different" } } })).json();
    expect(conflict.result.content[0].text).toMatch(/^idempotency_conflict/);
    // Versioning.
    const v = await request.get(`${BASE}/api/v1/tools`, { headers: auth(keyA, { "Gala-Api-Version": "1999-01-01" }) });
    expect(v.status()).toBe(400); expect((await v.json()).error.code).toBe("unsupported_api_version");
    expect((await request.get(`${BASE}/api/v1/tools`, { headers: auth(keyA) })).headers()["gala-api-version"]).toBe("2026-10-29");
  });

  test("key rotation: new key works, old key works during grace then dies; limits and expiry", async ({ request }) => {
    const n = mk();
    const r = await oc.rpc("rotate_api_key", { p_key: keyAid, p_prefix: n.prefix, p_hash: sha(n.key), p_grace_hours: 1 });
    expect(r.error).toBeNull();
    const nk = (await db.from("api_keys").select("id,rotated_from,acts_as,scopes,expires_at").eq("id", r.data as string).single()).data as { rotated_from: string; acts_as: string; scopes: string[] };
    expect(nk).toMatchObject({ rotated_from: keyAid, acts_as: O.id, scopes: ["events:read", "events:write", "finance:read"] });
    expect((await call(request, n.key, "events.list", {})).status()).toBe(200);
    expect((await call(request, keyA, "events.list", {})).status()).toBe(200);   // grace
    await db.from("api_keys").update({ expires_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", keyAid);
    expect((await call(request, keyA, "events.list", {})).status()).toBe(401);
    expect((await oc.rpc("rotate_api_key", { p_key: keyAid, p_prefix: "BBBBBBBB", p_hash: sha("z"), p_grace_hours: 1 })).error?.message).toMatch(/key_inactive/);
    expect((await oc.rpc("set_api_key_limits", { p_key: r.data, p_rate_limit: 5000, p_expires: null })).error?.message).toMatch(/rate_limit_check|violates/);
    expect((await oc.rpc("set_api_key_limits", { p_key: r.data, p_rate_limit: null, p_expires: new Date(Date.now() + 500 * 864e5).toISOString() })).error?.message).toMatch(/expiry_too_long/);
    expect((await oc.rpc("set_api_key_limits", { p_key: r.data, p_rate_limit: 60, p_expires: null })).error).toBeNull();
    keyA = n.key; keyAid = r.data as string;
    expect(((await db.from("domain_outbox").select("event_type").eq("workspace_id", A).eq("event_type", "api_key.rotated")).data ?? []).length).toBe(1);
  });

  test("webhooks: allow-listed payloads (no scores/ranking reasons/notes/contact), catalogue parity, versioned envelope", async () => {
    const { data: ep } = await db.from("webhook_endpoints").insert({ workspace_id: A, url: "https://192.0.2.10/hook", events: ["event.created", "booking.confirmed"], secret: "whsec_q30_secret_aaaaaaaaaaaaaaaa", created_by: O.id }).select("id").single();
    await db.from("audit_events").insert({ actor_id: O.id, actor_type: "user", workspace_id: A, event: "event.created",
      metadata: { event_id: EA, name: "Q30 Event A", score: 97, reasons: { fit: "paid placement" }, rank_reason: "boost", internal_note: "client is difficult", email: "x@y.z", ip: "1.2.3.4", budget: 99999 } });
    await db.from("audit_events").insert({ actor_id: O.id, actor_type: "user", workspace_id: B, event: "event.created", metadata: { event_id: EB } });   // other workspace
    const dels = (await db.from("webhook_deliveries").select("payload,event_type").eq("endpoint_id", (ep as Id).id)).data as { payload: { data: Record<string, unknown>; api_version: string; schema_version: number; workspace_id: string } }[];
    expect(dels.length).toBe(1);
    expect(dels[0]!.payload.data).toEqual({ event_id: EA, name: "Q30 Event A" });
    expect(dels[0]!.payload).toMatchObject({ api_version: "2026-10-29", schema_version: 1, workspace_id: A });
    // Parity: DB allow-list == TS catalogue; no allow-listed field matches the deny pattern.
    const rows = (await db.from("webhook_payload_fields").select("public_type,fields")).data as { public_type: string; fields: string[] }[];
    const dbMap = Object.fromEntries(rows.filter(r => r.public_type !== "ping").map(r => [r.public_type, [...r.fields].sort()]));
    expect(dbMap).toEqual(Object.fromEntries(Object.entries(WEBHOOK_TYPES).map(([k, v]) => [k, [...v].sort()])));
    expect(Object.values(WEBHOOK_TYPES).flat().filter(f => DENIED_FIELD.test(f))).toEqual([]);
    // Members can't read secrets; only owners/managers see endpoints at all.
    expect((await oc.from("webhook_endpoints").select("secret").limit(1)).error).not.toBeNull();
    expect((await oc.from("webhook_endpoints").select("previous_secret").limit(1)).error).not.toBeNull();
  });

  test("delivery: SSRF guard refuses private/TEST-NET targets before connecting; retries with backoff, dead letter, auto-disable, replay", async ({ request }) => {
    const ep = ((await db.from("webhook_endpoints").select("id").eq("workspace_id", A).single()).data as Id).id;
    const res = await request.post(`${BASE}/api/cron/webhooks`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(res.ok()).toBe(true);
    const d = (await db.from("webhook_deliveries").select("id,status,attempts,next_attempt_at,response_snippet").eq("endpoint_id", ep).single()).data as { id: string; status: string; attempts: number; next_attempt_at: string; response_snippet: string };
    expect(d).toMatchObject({ status: "failed", attempts: 1 });
    expect(d.response_snippet).toMatch(/public internet address/);
    expect(new Date(d.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 30_000);
    // Exhaust: attempts ≥ 8 → dead; sustained failures (≥ 20 over > 24 h) → endpoint disabled + managers notified.
    await db.from("webhook_deliveries").update({ attempts: 8 }).eq("id", d.id);
    await db.from("webhook_endpoints").update({ consecutive_failures: 19, first_failure_at: new Date(Date.now() - 25 * 36e5).toISOString() }).eq("id", ep);
    await db.rpc("finish_webhook_delivery", { p_delivery: d.id, p_ok: false, p_status: 500, p_snippet: "x" });
    expect((await db.from("webhook_deliveries").select("status").eq("id", d.id).single()).data?.status).toBe("dead");
    expect((await db.from("webhook_endpoints").select("status").eq("id", ep).single()).data?.status).toBe("disabled");
    expect(((await db.from("notifications").select("id").eq("user_id", O.id).eq("title", "Webhook endpoint disabled")).data ?? []).length).toBeGreaterThan(0);
    expect((await oc.rpc("replay_webhook_delivery", { p_delivery: d.id })).error).toBeNull();
    expect((await db.from("webhook_deliveries").select("status,attempts").eq("id", d.id).single()).data).toMatchObject({ status: "pending", attempts: 0 });
    // Secret rotation: previous secret keeps signing for 24 h.
    expect((await oc.rpc("rotate_webhook_secret", { p_endpoint: ep, p_secret: "whsec_" + "n".repeat(32) })).error).toBeNull();
    expect(((await db.rpc("webhook_signing_secrets", { p_endpoint: ep })).data as string[]).length).toBe(2);
    expect((await oc.rpc("webhook_signing_secrets", { p_endpoint: ep })).error).not.toBeNull();   // service only
  });

  test("signature contract: HMAC over t.body, dual signatures during rotation, 300 s replay window, tamper detection", () => {
    const body = JSON.stringify({ id: "e1", type: "event.created" }), now = 1_800_000_000;
    const s = signPayload(body, ["whsec_new", "whsec_old"], now);
    expect(s.header).toMatch(/^t=1800000000,v1=[0-9a-f]{64},v1=[0-9a-f]{64}$/);
    expect(verifySignature(s.header, body, "whsec_new", now + 10)).toMatchObject({ ok: true });
    expect(verifySignature(s.header, body, "whsec_old", now + 10)).toMatchObject({ ok: true });
    expect(verifySignature(s.header, body, "whsec_other", now)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifySignature(s.header, body + " ", "whsec_new", now)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifySignature(s.header, body, "whsec_new", now + 301)).toMatchObject({ ok: false, reason: "expired" });
    expect(verifySignature("v1=abc", body, "whsec_new", now)).toMatchObject({ ok: false, reason: "malformed" });
  });

  test("event feed: cursor sync, workspace-bound, scope-gated, same sanitised payloads", async ({ request }) => {
    expect((await request.get(`${BASE}/api/v1/events`, { headers: auth(keyA) })).status()).toBe(403);   // no feed:read
    let cursor = "0"; const seen: { id: string; type: string; data: Record<string, unknown> }[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await (await request.get(`${BASE}/api/v1/events?cursor=${cursor}&limit=50`, { headers: auth(feedKey) })).json();
      seen.push(...r.data);
      if (r.next_cursor === cursor) break;
      cursor = r.next_cursor;
    }
    const created = seen.find(e => e.type === "event.created" && e.data.event_id === EA);
    expect(created?.data).toEqual({ event_id: EA, name: "Q30 Event A" });
    expect(JSON.stringify(seen)).not.toContain(EB);
    expect(JSON.stringify(seen)).not.toMatch(/paid placement|client is difficult|x@y\.z/);
    expect((await (await request.get(`${BASE}/api/v1/events?cursor=${cursor}`, { headers: auth(feedKey) })).json()).data).toEqual([]);
    expect((await request.get(`${BASE}/api/v1/events?cursor=abc`, { headers: auth(feedKey) })).status()).toBe(400);
  });

  test("OpenAPI matches the gateway: every exposed tool, no R4/R5, real status codes, webhooks with allow-listed fields", async ({ request }) => {
    const doc = await (await request.get(`${BASE}/api/v1/openapi.json`)).json();
    const paths = Object.keys(doc.paths).filter((p: string) => p.startsWith("/tools/")).map((p: string) => p.slice(7)).sort();
    const listed = ((await (await request.get(`${BASE}/api/v1/tools`, { headers: auth(keyA) })).json()).data as { name: string }[]).map(t => t.name);
    expect(listed.every(n => paths.includes(n))).toBe(true);
    for (const r4 of ["quote.send", "tickets.publish_tier", "standby.activate", "cancellation.request"]) expect(paths).not.toContain(r4);
    const op = doc.paths["/tools/task.create"].post;
    expect(Object.keys(op.responses).sort()).toEqual(["200", "400", "401", "403", "404", "409", "422", "429", "500", "503"]);
    expect(doc.info.version).toBe("2026-10-29");
    expect(doc.paths["/events"].get["x-scope"]).toBe("feed:read");
    expect(Object.keys(doc.webhooks).sort()).toEqual(Object.keys(WEBHOOK_TYPES).sort());
    // Each documented status is actually produced by the handler.
    expect((await request.post(`${BASE}/api/v1/tools/task.create`, { headers: auth("gd_live_nope") , data: {} })).status()).toBe(401);
    expect((await call(request, keyA, "task.create", { event_id: "x" })).status()).toBe(422);
    expect((await call(request, keyA, "nope.tool", {})).status()).toBe(404);
    expect((await request.post(`${BASE}/api/v1/tools/task.create`, { headers: { ...auth(keyA), "Content-Type": "application/json" }, data: "[1]" })).status()).toBe(400);
  });

  test("calendar sync health is service-only and reported", async () => {
    const h = (await db.rpc("calendar_sync_health")).data as Record<string, unknown>;
    expect(h).toEqual(expect.objectContaining({ connections: expect.any(Number), active_stale: expect.any(Number), with_errors: expect.any(Number) }));
    expect((await oc.rpc("calendar_sync_health")).error).not.toBeNull();
  });
});
