import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, enrolTotp, seedWorkspace, signedIn } from "../phase1/helpers";

// Q35 analytics / warehouse (domains 223–228, 265–266) — API-level against the shared project with disposable, flagged fixtures.
// Exit gate: dashboard definitions reproduce from facts/snapshots (no unbounded transactional scans) and reconcile to the ledger,
// entitlements, check-ins, bookings and the AI meter. Covers: capture privacy (no PII, consent, DNT), tenant isolation, role-gated
// finance metrics, late events, refund reversals, metric versions, demo exclusion, exports, erasure.
type U = { id: string; email: string };
const db = admin as unknown as SupabaseClient;
const rpc = async <T>(c: SupabaseClient, fn: string, args: Record<string, unknown>) => {
  const r = await c.rpc(fn, args);
  return r as { data: T; error: { message: string } | null };
};
const london = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const metric = (list: { key: string; value: number | null }[], key: string) => list.find(m => m.key === key);

test.describe.configure({ mode: "serial" });

test.describe("Q35 analytics warehouse", () => {
  let O: U, Mem: U, Fin: U, X: U, Adm: U;
  let oc: SupabaseClient, mc: SupabaseClient, fc: SupabaseClient, xc: SupabaseClient, ac: SupabaseClient;
  let A = "", B = "", EA = "", TA = "", orderRef = "";
  const marker = `q35${randomBytes(3).toString("hex")}`;

  test.beforeAll(async () => {
    [O, Mem, Fin, X, Adm] = await Promise.all([createUser("q35-owner"), createUser("q35-member"), createUser("q35-fin"), createUser("q35-x"), createUser("q35-admin")]);
    A = await seedWorkspace(O.id, "organizer", "Q35 Org A");
    B = await seedWorkspace(X.id, "organizer", "Q35 Org B");
    await db.from("workspace_members").insert([{ workspace_id: A, user_id: Mem.id, role: "member", status: "active" }, { workspace_id: A, user_id: Fin.id, role: "finance", status: "active" }]);
    EA = (await db.from("events").insert({ owner_id: O.id, workspace_id: A, name: "Q35 Event A", visibility: "private", starts_at: new Date(Date.now() + 5 * 864e5).toISOString() }).select("id").single()).data!.id;
    TA = (await db.from("ticket_tiers").insert({ event_id: EA, name: "GA", price: 20, quantity: 10, status: "draft" }).select("id").single()).data!.id;
    orderRef = `Q35-${randomBytes(4).toString("hex")}`;
    const co = await db.from("checkout_orders").insert({ order_ref: orderRef, event_id: EA, buyer_id: O.id, token: randomUUID(), amount: 40, fee: 2, currency: "GBP", status: "issued", lines: [], kind: "primary" } as never);
    expect(co.error).toBeNull();
    // Two tickets yesterday (late arrival for yesterday's facts) and one today.
    const mk = (n: number, at: string) => ({ code: `Q35-${randomBytes(5).toString("hex").toUpperCase()}-${n}`, event_id: EA, tier_id: TA, holder_id: O.id, attendee_name: "Q35 Guest",
      order_ref: orderRef, price_paid: 20, created_at: at });
    const y = new Date(Date.now() - 864e5).toISOString();
    expect((await db.from("tickets").insert([mk(1, y), mk(2, y), mk(3, new Date().toISOString())])).error).toBeNull();
    await db.from("platform_admins").insert({ user_id: Adm.id, title: "Q35 analytics admin", permissions: ["analytics"] });
    [oc, mc, fc, xc, ac] = (await Promise.all([O, Mem, Fin, X, Adm].map(u => signedIn(u.email)))) as unknown as SupabaseClient[];
    await enrolTotp(ac as never);
    const b = await rpc(db, "analytics_build_range", { p_from: london(-2), p_to: london(0), p_trigger: "q35-spec" });
    expect(b.error).toBeNull();
  });

  test.afterAll(async () => {
    await db.from("analytics_events").delete().in("workspace_id", [A, B]);
    await db.from("analytics_events").delete().eq("props->>feature", marker);
    await db.from("analytics_exports").delete().in("requested_by", [O.id, Mem.id, Fin.id, X.id, Adm.id]);
    for (const t of ["fact_ticket_daily", "fact_event_daily", "fact_payment_daily", "fact_booking_daily", "fact_agent_daily", "fact_product_daily"]) await db.from(t).delete().in("workspace_id", [A, B]);
    await db.from("tickets").delete().eq("event_id", EA);
    await db.from("checkout_orders").delete().eq("order_ref", orderRef);
    await db.from("ticket_tiers").delete().eq("event_id", EA);
    await db.from("events").delete().in("workspace_id", [A, B]);
    await db.from("platform_admins").delete().eq("user_id", Adm.id);
    await db.from("workspaces").delete().in("id", [A, B]);
    await cleanup();
  });

  test("capture route stores no PII, normalises paths, honours DNT and cross-site refusal", async ({ request }) => {
    const events = [{ name: "feature.used", path: `/organizer/events/${EA}?secret=1`, props: { feature: marker, surface: "jane@example.com" } },
      { name: "not.defined", path: "/x", props: { feature: marker } }];
    expect((await request.post(`${BASE}/api/analytics/capture`, { data: { events } })).status()).toBe(204);
    expect((await request.post(`${BASE}/api/analytics/capture`, { data: { events }, headers: { DNT: "1" } })).status()).toBe(204);
    expect((await request.post(`${BASE}/api/analytics/capture`, { data: { events }, headers: { Origin: "https://evil.example" } })).status()).toBe(204);
    const rows = (await db.from("analytics_events").select("event_name,path,props,subject_kind,consent,subject_id").eq("props->>feature", marker)).data ?? [];
    expect(rows).toHaveLength(1);                                     // DNT and cross-site calls stored nothing; unknown event dropped
    expect(rows[0]).toMatchObject({ event_name: "feature.used", path: "/organizer/events/:id", props: { feature: marker }, subject_kind: "visitor_daily", consent: "unknown" });
    expect(rows[0]!.subject_id).toMatch(/^[0-9a-f]{64}$/);            // HMAC pseudonym, never an IP/user id
  });

  test("consent decides the identifier; erasure deletes stable-id events", async () => {
    const ctx = (consent: string) => ({ user_id: X.id, consent, workspace_id: B, visitor_hash: "b".repeat(64) });
    const ev = [{ name: "checkout.started" }, { name: "checkout.completed" }];
    expect((await rpc<{ accepted: number }>(db, "analytics_capture", { p_events: ev, p_ctx: ctx("granted") })).data.accepted).toBe(2);
    expect((await rpc<{ accepted: number }>(db, "analytics_capture", { p_events: ev, p_ctx: ctx("denied") })).data.accepted).toBe(2);
    const kinds = ((await db.from("analytics_events").select("subject_kind").eq("workspace_id", B)).data ?? []).map(r => r.subject_kind).sort();
    expect(kinds).toEqual(["user", "user", "visitor_daily", "visitor_daily"]);
    // Funnel (ordered) for the workspace, as its owner.
    const f = await rpc<{ steps: { subjects: number }[] }>(xc, "analytics_funnel", { p_steps: ["checkout.started", "checkout.completed"], p_from: london(-1), p_to: london(0), p_workspace: B });
    expect(f.error).toBeNull();
    expect(f.data.steps.map(s => s.subjects)).toEqual([2, 2]);
    await db.from("audit_events").insert({ actor_type: "system", event: "privacy.user_erased", metadata: { user: X.id, test: "q35" } });
    expect(((await db.from("analytics_events").select("subject_kind").eq("workspace_id", B)).data ?? []).map(r => r.subject_kind)).toEqual(["visitor_daily", "visitor_daily"]);
    // A foreign workspace id is not attributed; too many events refused.
    await rpc(db, "analytics_capture", { p_events: [{ name: "feature.used", props: { feature: marker } }], p_ctx: { user_id: X.id, consent: "granted", workspace_id: A } });
    expect((await db.from("analytics_events").select("id").eq("workspace_id", A)).data).toHaveLength(0);
    expect((await rpc(db, "analytics_capture", { p_events: Array.from({ length: 51 }, () => ({ name: "page.viewed" })), p_ctx: ctx("granted") })).error?.message).toContain("too_many_events");
  });

  test("tenant isolation and role-gated finance metrics", async ({ request }) => {
    const span = { p_from: london(-2), p_to: london(0) };
    const own = await rpc<{ metrics: { key: string; value: number | null }[] }>(oc, "analytics_workspace_metrics", { p_workspace: A, ...span });
    expect(own.error).toBeNull();
    expect(metric(own.data.metrics, "tickets_issued")?.value).toBe(3);
    expect(metric(own.data.metrics, "ticket_gross")?.value).toBe(6000);
    const mem = await rpc<{ metrics: { key: string }[] }>(mc, "analytics_workspace_metrics", { p_workspace: A, ...span });
    expect(metric(mem.data.metrics as never, "tickets_issued")).toBeTruthy();
    expect(metric(mem.data.metrics as never, "ticket_gross")).toBeUndefined();       // finance metric hidden from plain members
    expect(metric(mem.data.metrics as never, "gmv")).toBeUndefined();
    const fin = await rpc<{ metrics: { key: string }[] }>(fc, "analytics_workspace_metrics", { p_workspace: A, ...span });
    expect(metric(fin.data.metrics as never, "gmv")).toBeTruthy();
    expect((await rpc(xc, "analytics_workspace_metrics", { p_workspace: A, ...span })).error?.message).toContain("not_authorized");
    expect((await rpc(xc, "analytics_event_report", { p_event: EA })).error?.message).toContain("not_authorized");
    expect((await rpc(xc, "analytics_trend", { p_metric: "tickets_issued", p_workspace: A, ...span })).error?.message).toContain("not_authorized");
    expect((await rpc(oc, "analytics_platform_report", span)).error?.message).toContain("not_authorized");
    expect((await oc.from("fact_ticket_daily").select("day")).error?.message).toMatch(/permission denied/);
    expect((await oc.from("analytics_events").select("id")).error?.message).toMatch(/permission denied/);
    // HTTP route without a session → 403, malformed → 400.
    expect((await request.get(`${BASE}/api/analytics/metrics?workspace=${A}`)).status()).toBe(403);
    expect((await request.get(`${BASE}/api/analytics/metrics?workspace=nope`)).status()).toBe(400);
  });

  test("event report: revenue, attendance, sell-through, pace, sources", async () => {
    const r = await rpc<{ sales: { issued: number; capacity: number; sell_through: number }; revenue: { ticket_gross_minor: number }; attendance: { admitted: number } }>(oc, "analytics_event_report", { p_event: EA });
    expect(r.error).toBeNull();
    expect(r.data.sales).toMatchObject({ issued: 3, capacity: 10, sell_through: 0.3 });
    expect(r.data.revenue.ticket_gross_minor).toBe(6000);
    expect(r.data.attendance.admitted).toBe(0);
    const m = await rpc<{ metrics: { key: string; value: number | null }[] }>(mc, "analytics_event_report", { p_event: EA });
    expect((m.data as unknown as { revenue: unknown }).revenue).toBeNull();          // members see attendance/sales, not money
  });

  test("late events and refund reversals land on the right day after a rebuild", async () => {
    const day = (d: string) => db.from("fact_ticket_daily").select("tickets_issued,tickets_refunded").eq("event_id", EA).eq("day", d);
    // A late ticket for two days ago, then the order is refunded today.
    await db.from("tickets").insert({ code: `Q35-LATE-${randomBytes(4).toString("hex")}`, event_id: EA, tier_id: TA, holder_id: O.id, attendee_name: "Late", order_ref: orderRef, price_paid: 20,
      created_at: new Date(Date.now() - 2 * 864e5).toISOString() });
    await db.from("checkout_orders").update({ refunded_at: new Date().toISOString(), refund_status: "refunded" } as never).eq("order_ref", orderRef);
    expect((await rpc(db, "analytics_build_range", { p_from: london(-2), p_to: london(0), p_trigger: "q35-spec" })).error).toBeNull();
    const sum = (rows: { tickets_issued: number; tickets_refunded: number }[] | null, k: "tickets_issued" | "tickets_refunded") => (rows ?? []).reduce((a, r) => a + r[k], 0);
    expect(sum((await day(london(-2))).data, "tickets_issued")).toBe(1);
    expect(sum((await day(london(0))).data, "tickets_refunded")).toBe(4);           // reversal on the refund day, sale days unchanged
    expect(sum((await day(london(-1))).data, "tickets_issued")).toBe(2);
    const st = await rpc<{ value: number }>(db, "analytics_eval", { p_key: "ticket_sell_through", p_from: london(0), p_to: london(10), p_workspace: A });
    expect(st.data.value).toBe(0);                                                  // 4 issued − 4 refunded
    const rec = await rpc<{ ok: boolean; checks: { check: string; ok: boolean }[] }>(db, "analytics_reconcile", { p_from: london(-2), p_to: london(0) });
    expect(rec.data.checks.filter(c => !c.ok)).toEqual([]);
  });

  test("metric definitions are versioned data: publish, restore, immutable", async () => {
    const spec = { type: "ratio", numerator: { type: "sum", fact: "fact_payment_daily", measures: ["platform_fee_net_minor", "own_sale_revenue_minor"] },
      denominator: { type: "sum", fact: "fact_payment_daily", measures: ["gmv_minor"] } };
    const args = { p_key: `q35_${marker}`, p_name: "Q35 test", p_description: "spec", p_domain: "finance", p_unit: "ratio", p_audience: "platform_admin", p_spec: spec, p_reason: "q35 spec test" };
    expect((await rpc(oc, "admin_metric_publish", args)).error?.message).toContain("not_authorized");
    expect((await rpc<number>(ac, "admin_metric_publish", args)).data).toBe(1);
    expect((await rpc<number>(ac, "admin_metric_publish", args)).data).toBe(2);
    expect((await rpc(ac, "admin_metric_activate", { p_key: args.p_key, p_version: 1, p_reason: "restore v1" })).error).toBeNull();
    expect((await db.from("metric_definition_active").select("version").eq("key", args.p_key).single()).data?.version).toBe(1);
    expect((await rpc(ac, "admin_metric_publish", { ...args, p_spec: { type: "sum", fact: "profiles", measures: ["email"] } })).error?.message).toContain("invalid_fact");
    expect((await db.from("metric_definitions").update({ spec: { type: "sum", fact: "fact_ticket_daily", measures: ["admitted"] } }).eq("key", args.p_key)).error?.message).toContain("immutable");
    const v = await rpc<{ version: number; unit: string }>(db, "analytics_eval", { p_key: args.p_key, p_from: london(-30), p_to: london(0), p_workspace: null });
    expect(v.data).toMatchObject({ version: 1, unit: "ratio" });
    // Test-only keys: retire both versions and drop the pointer so they never appear in reports.
    await db.from("metric_definitions").update({ status: "retired" }).eq("key", args.p_key);
    await db.from("metric_definition_active").delete().eq("key", args.p_key);
  });

  test("platform reporting excludes demo/test workspaces unless asked; reconciles", async () => {
    const span = { p_from: london(-2), p_to: london(0) };
    const excl = await rpc<{ value: number }>(db, "analytics_eval", { p_key: "tickets_issued", ...span, p_workspace: null, p_include_demo: false });
    const incl = await rpc<{ value: number }>(db, "analytics_eval", { p_key: "tickets_issued", ...span, p_workspace: null, p_include_demo: true });
    expect(incl.data.value - excl.data.value).toBeGreaterThanOrEqual(4);             // the flagged fixture's 4 tickets only in the demo-inclusive view
    const rep = await rpc<{ metrics: unknown[]; supply_gaps: unknown[] }>(ac, "analytics_platform_report", span);
    expect(rep.error).toBeNull();
    expect(rep.data.metrics.length).toBeGreaterThan(30);
    expect((await rpc<{ ok: boolean }>(ac, "analytics_reconcile", span)).data.ok).toBe(true);
    expect((await rpc(ac, "analytics_retention", { p_from: london(-30), p_weeks: 4 })).error).toBeNull();
  });

  test("exports: permission at request, generation and download; audited", async () => {
    expect((await rpc(mc, "analytics_request_export", { p_dataset: "ticket_daily", p_workspace: A, p_from: london(-2), p_to: london(0) })).error?.message).toContain("not_authorized");
    expect((await rpc(xc, "analytics_request_export", { p_dataset: "ticket_daily", p_workspace: A, p_from: london(-2), p_to: london(0) })).error?.message).toContain("not_authorized");
    const id = (await rpc<string>(fc, "analytics_request_export", { p_dataset: "ticket_daily", p_workspace: A, p_from: london(-2), p_to: london(0) })).data;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    let res: { status: string; csv?: string; rows?: number } = { status: "queued" };
    for (let i = 0; i < 30 && res.status !== "ready"; i++) {          // the db-jobs worker (pg_cron, every minute) generates it
      await new Promise(r => setTimeout(r, 5000));
      res = (await rpc<typeof res>(fc, "analytics_export_download", { p_export: id })).data;
    }
    expect(res.status).toBe("ready");
    expect(res.csv!.split("\n")[0]).toContain("tickets_issued");
    expect(res.rows).toBeGreaterThan(0);
    expect((await rpc(oc, "analytics_export_download", { p_export: id })).error?.message).toContain("not_found");   // only the requester
    expect((await fc.from("analytics_exports").select("content").eq("id", id)).error?.message).toMatch(/permission denied/);
    expect(((await db.from("audit_events").select("event").eq("workspace_id", A).in("event", ["analytics.export_requested", "analytics.export_downloaded"])).data ?? []).length).toBe(2);
  });
});
