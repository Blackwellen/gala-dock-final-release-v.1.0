import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, admin, cleanup, createUser, signedIn, enrolTotp, seedWorkspace } from "../phase1/helpers";

// Q31 remainder (lane D, migrations 202610294023–4026): support lifecycle, SLA timers, assignment, macros, linked records,
// customer-visible vs internal notes, safeguarding scope, the job / dead-letter / outbox console, admin review read scopes,
// permission tiers and the health contract. API level with disposable identities and disposable rows only: jobs use the
// support.sla_sweep kind with far-future run times, outbox rows are synthetic, and everything is removed in afterAll.
// Nothing here sends email (support notifications are in-app only), moves money, runs AI or activates maintenance.
const db = admin as unknown as SupabaseClient;
const tag = randomBytes(3).toString("hex");
type U = { id: string; email: string; c: SupabaseClient };
const msg = (e: { message?: string } | null) => e?.message ?? "";

async function login(email: string): Promise<SupabaseClient> {
  for (let i = 0; ; i++) {
    try { return await signedIn(email) as unknown as SupabaseClient; } catch (e) {
      if (i >= 5 || !/rate limit/i.test(String(e))) throw e;
      await new Promise(r => setTimeout(r, 15_000 * (i + 1)));
    }
  }
}
async function mkAdmin(label: string, permissions: string[], mfa = true): Promise<U> {
  const u = await createUser(`q31-${label}`, `Q31 ${label}`);
  const { error } = await db.from("platform_admins").insert({ user_id: u.id, title: `Q31 ${label} ${tag}`, permissions });
  if (error) throw error;
  const c = await login(u.email);
  if (mfa) await enrolTotp(c as never, `q31-${tag}`);
  return { ...u, c };
}

test.describe.configure({ mode: "serial" });
test.describe("Q31 support operations, ops console and admin review", () => {
  let lead: U, sup: U, ops: U, bare: U, cust: U;
  const cases: string[] = [], macros: string[] = [], jobs: string[] = [], outbox: string[] = [], trustCases: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    lead = await mkAdmin("lead", ["support", "trust", "settings", "tickets"]);
    sup = await mkAdmin("support", ["support"]);
    ops = await mkAdmin("ops", ["agent_ops"]);
    bare = await mkAdmin("nofactor", ["support", "settings"], false);
    const c = await createUser("q31-cust", "Casey Customer");
    cust = { ...c, c: await login(c.email) };
  });

  test.afterAll(async () => {
    const admins = [lead, sup, ops, bare].filter(Boolean).map(a => a.id);
    if (jobs.length) await db.from("job_queue").delete().in("id", jobs);
    if (outbox.length) { await db.from("job_queue").delete().in("event_id", outbox); await db.from("domain_outbox").delete().in("id", outbox); }
    const { data: own } = await db.from("support_cases").select("id,trust_case_id").or(`requester_id.eq.${cust?.id ?? "00000000-0000-0000-0000-000000000000"},reference.like.Q31-${tag}%`);
    const ids = [...new Set([...cases, ...((own ?? []) as { id: string }[]).map(x => x.id)])];
    const tc = [...trustCases, ...((own ?? []) as { trust_case_id: string | null }[]).map(x => x.trust_case_id).filter(Boolean) as string[]];
    if (ids.length) await db.from("support_cases").delete().in("id", ids);
    if (tc.length) await db.from("trust_cases").delete().in("id", tc);
    if (macros.length) await db.from("support_macros").delete().in("id", macros);
    await db.from("audit_events").delete().in("actor_id", admins);
    await db.from("platform_admins").delete().in("user_id", admins);
    await cleanup();
  });

  test("case lifecycle: SLA from policy, customer reply resumes the paused clock, internal notes stay internal", async () => {
    const { data: id, error } = await lead.c.rpc("admin_create_support_case", { p_subject: `Q31 ${tag} refund question`, p_category: "refund", p_priority: "high", p_requester: "Casey Customer", p_body: "Internal triage note", p_related: {} });
    expect(error).toBeNull(); cases.push(id as string);
    await db.from("support_cases").update({ requester_id: cust.id }).eq("id", id);
    const { data: c0 } = await db.from("support_cases").select("created_at,sla_due_at,first_response_due_at").eq("id", id).single();
    const span = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000);
    const { data: pol } = await db.from("support_sla_policies").select("first_response_minutes,resolution_minutes").eq("priority", "high").single();
    expect(span(c0!.sla_due_at, c0!.created_at)).toBe(pol!.resolution_minutes);
    expect(span(c0!.first_response_due_at, c0!.created_at)).toBe(Math.min(pol!.first_response_minutes, pol!.resolution_minutes));

    expect(msg((await lead.c.rpc("admin_reply_case", { p_case: id, p_body: "Hi Casey, we are on it.", p_internal: false })).error)).toBe("");
    expect(msg((await lead.c.rpc("admin_reply_case", { p_case: id, p_body: "Internal: Stripe shows refund pending.", p_internal: true })).error)).toBe("");
    const { data: seen } = await cust.c.from("support_messages").select("body,internal").eq("case_id", id);
    expect((seen ?? []).some(m => m.internal)).toBe(false);
    expect((seen ?? []).map(m => m.body)).toContain("Hi Casey, we are on it.");
    expect((await cust.c.from("support_case_events").select("id").eq("case_id", id)).data ?? []).toHaveLength(0);
    const { data: note } = await db.from("notifications").select("kind").eq("user_id", cust.id).eq("kind", "support.case_reply");
    expect(note?.length).toBeGreaterThan(0);
    expect((await db.from("email_outbox").select("id").eq("user_id", cust.id)).data ?? []).toHaveLength(0);   // in-app only

    expect(msg((await lead.c.rpc("admin_update_case", { p_case: id, p_status: "waiting", p_reason: "Asked for order ref", p_outcome: null })).error)).toBe("");
    await db.from("support_cases").update({ sla_paused_at: new Date(Date.now() - 20 * 60000).toISOString() }).eq("id", id);
    expect(msg((await cust.c.rpc("support_case_reply", { p_case: id, p_body: "My order is GD-1234" })).error)).toBe("");
    const { data: c1 } = await db.from("support_cases").select("status,sla_paused_minutes,last_customer_reply_at,first_responded_at").eq("id", id).single();
    expect(c1!.status).toBe("open");
    expect(c1!.sla_paused_minutes).toBeGreaterThanOrEqual(20);
    expect(c1!.first_responded_at).not.toBeNull();
    // A stranger cannot reply or even learn the case exists.
    const stranger = await createUser("q31-stranger");
    expect(msg((await (await login(stranger.email)).rpc("support_case_reply", { p_case: id, p_body: "hello there" })).error)).toBe("not_found");
  });

  test("assignment, priority, macros, linked records, escalation, close is terminal; history is append-only", async () => {
    const id = cases[0]!;
    expect(msg((await lead.c.rpc("admin_assign_case_to", { p_case: id, p_assignee: sup.id, p_reason: "Hand over to Tier 1" })).error)).toBe("");
    expect(msg((await lead.c.rpc("admin_assign_case_to", { p_case: id, p_assignee: cust.id, p_reason: "Not an admin" })).error)).toBe("invalid_assignee");
    expect(msg((await lead.c.rpc("admin_assign_case_to", { p_case: id, p_assignee: sup.id, p_reason: "x" })).error)).toBe("reason_required");
    const { data: names } = await sup.c.rpc("admin_support_assignees", { p_safeguarding: false });
    expect((names as { user_id: string }[]).some(n => n.user_id === sup.id)).toBe(true);

    expect(msg((await sup.c.rpc("admin_set_case_priority", { p_case: id, p_priority: "urgent", p_reason: "Travelling tonight" })).error)).toBe("");
    const { data: mid, error: me } = await sup.c.rpc("admin_save_support_macro", { p_id: null, p_title: `Q31 ${tag} ask ref`, p_body: "Hi {{requester_name}}, about {{reference}}: please send your order reference.", p_category: null, p_internal: false, p_set_status: "waiting", p_version: null });
    expect(me).toBeNull(); macros.push(mid as string);
    expect(msg((await sup.c.rpc("admin_save_support_macro", { p_id: mid, p_title: `Q31 ${tag} ask ref`, p_body: "Changed text here", p_category: null, p_internal: false, p_set_status: null, p_version: 7 })).error)).toBe("stale_version");
    expect(msg((await sup.c.rpc("admin_apply_support_macro", { p_case: id, p_macro: mid })).error)).toBe("");
    const { data: c2 } = await db.from("support_cases").select("status,reference").eq("id", id).single();
    expect(c2!.status).toBe("waiting");
    const { data: last } = await db.from("support_messages").select("body").eq("case_id", id).order("id", { ascending: false }).limit(1).single();
    expect(last!.body).toBe(`Hi Casey, about ${c2!.reference}: please send your order reference.`);

    const { data: ev } = await db.from("events").select("id").limit(1).single();
    const { data: link, error: le } = await sup.c.rpc("admin_link_case_record", { p_case: id, p_type: "event", p_id: (ev as { id: string }).id });
    expect(le).toBeNull();
    expect(msg((await sup.c.rpc("admin_link_case_record", { p_case: id, p_type: "event", p_id: (ev as { id: string }).id })).error)).toBe("already_linked");
    expect(msg((await sup.c.rpc("admin_link_case_record", { p_case: id, p_type: "workspace", p_id: crypto.randomUUID() })).error)).toBe("record_not_found");
    expect(msg((await sup.c.rpc("admin_unlink_case_record", { p_link: link })).error)).toBe("");

    expect(msg((await sup.c.rpc("admin_escalate_case_to_trust", { p_case: id, p_reason: "Possible takeover" })).error)).toBe("not_authorized");
    const { data: tid, error: te } = await lead.c.rpc("admin_escalate_case_to_trust", { p_case: id, p_reason: "Possible account takeover" });
    expect(te).toBeNull(); trustCases.push(tid as string);

    expect(msg((await sup.c.rpc("admin_update_case", { p_case: id, p_status: "resolved", p_reason: "Refund done", p_outcome: "Refunded" })).error)).toBe("");
    expect(msg((await sup.c.rpc("admin_update_case", { p_case: id, p_status: "closed", p_reason: "Confirmed with customer", p_outcome: null })).error)).toBe("");
    expect(msg((await sup.c.rpc("admin_update_case", { p_case: id, p_status: "open", p_reason: "Try reopen", p_outcome: null })).error)).toBe("invalid_transition");
    expect(msg((await cust.c.rpc("support_case_reply", { p_case: id, p_body: "One more thing" })).error)).toBe("case_closed");
    const { data: hist } = await sup.c.from("support_case_events").select("kind").eq("case_id", id);
    const kinds = new Set((hist ?? []).map(h => h.kind));
    for (const k of ["created", "status", "priority", "assigned", "reply", "note", "customer_reply", "macro", "linked", "unlinked", "escalated_trust"]) expect(kinds.has(k)).toBe(true);
    const upd = await db.from("support_case_events").update({ detail: {} }).eq("case_id", id);
    expect(msg(upd.error)).toContain("append_only");
  });

  test("safeguarding cases: urgent, Trust & Safety alerted in-app, invisible to support-only admins; admin without MFA refused", async () => {
    const { data: ref, error } = await cust.c.rpc("contact_support", { p_subject: "I felt unsafe at an event", p_body: "A steward behaved inappropriately towards me last night.", p_category: "safeguarding", p_workspace: null, p_source: "Help Centre" });
    expect(error).toBeNull();
    const { data: sg } = await db.from("support_cases").select("id,priority").eq("reference", ref).single();
    cases.push(sg!.id); expect(sg!.priority).toBe("urgent");
    expect(((await db.from("notifications").select("user_id").eq("kind", "support.safeguarding").eq("user_id", lead.id)).data ?? []).length).toBe(1);
    expect(((await db.from("notifications").select("user_id").eq("kind", "support.safeguarding").eq("user_id", sup.id)).data ?? []).length).toBe(0);
    expect((await sup.c.from("support_cases").select("id").eq("id", sg!.id)).data ?? []).toHaveLength(0);
    expect((await lead.c.from("support_cases").select("id").eq("id", sg!.id)).data ?? []).toHaveLength(1);
    expect(msg((await sup.c.rpc("admin_reply_case", { p_case: sg!.id, p_body: "hello", p_internal: false })).error)).toBe("not_authorized");
    expect(msg((await bare.c.rpc("admin_reply_case", { p_case: cases[0], p_body: "hello", p_internal: false })).error)).toBe("step_up_required");
    expect(msg((await sup.c.rpc("admin_set_sla_policy", { p_priority: "low", p_first_minutes: 240, p_resolution_minutes: 960, p_auto_close_days: 14, p_reason: "Not allowed" })).error)).toBe("not_authorized");
  });

  test("job console: keys-only reads, retry / cancel / replay with reason, consumers never re-run, scoped by permission", async () => {
    const far = new Date(Date.now() + 365 * 864e5).toISOString();
    const ins = async (row: Record<string, unknown>) => { const { data, error } = await db.from("job_queue").insert({ kind: "support.sla_sweep", run_after: far, ...row }).select("id").single(); if (error) throw error; jobs.push(data!.id); return data!.id as string; };
    const dead = await ins({ status: "dead", attempts: 3, max_attempts: 3, last_error: `q31 ${tag} boom`, finished_at: new Date().toISOString(), payload: { secret_email: "x@y.z" } });
    const queued = await ins({ status: "queued" });
    const live = await ins({ status: "running", locked_by: `q31-${tag}`, lease_until: far, started_at: new Date().toISOString() });

    expect(msg((await sup.c.rpc("admin_ops_overview")).error)).toBe("not_authorized");
    const { data: list, error } = await ops.c.rpc("admin_job_list", { p_status: "dead", p_kind: "support.sla_sweep", p_limit: 200, p_offset: 0 });
    expect(error).toBeNull();
    const row = (list as { id: string; payload_keys: string[]; payload?: unknown }[]).find(j => j.id === dead)!;
    expect(row.payload_keys).toEqual(["secret_email"]); expect(row.payload).toBeUndefined();
    expect(msg((await ops.c.rpc("admin_job_retry", { p_job: dead, p_reason: "Read-only role" })).error)).toBe("not_authorized");
    expect(msg((await lead.c.rpc("admin_job_retry", { p_job: dead, p_reason: "x" })).error)).toBe("reason_required");
    expect(msg((await lead.c.rpc("admin_job_cancel", { p_job: dead, p_reason: "Cancel a dead job" })).error)).toBe("not_cancellable");
    // Cancel first so the replayed job can never execute: it is queued a year ahead and then cancelled again.
    expect(msg((await lead.c.rpc("admin_job_retry", { p_job: dead, p_reason: "Handler fixed" })).error)).toBe("");
    await db.from("job_queue").update({ run_after: far }).eq("id", dead);
    expect(msg((await lead.c.rpc("admin_job_cancel", { p_job: dead, p_reason: "Test cleanup" })).error)).toBe("");
    expect(msg((await lead.c.rpc("admin_job_cancel", { p_job: queued, p_reason: "Duplicate job" })).error)).toBe("");
    expect(msg((await lead.c.rpc("admin_job_cancel", { p_job: live, p_reason: "Live worker" })).error)).toBe("not_cancellable");
    expect(msg((await lead.c.rpc("admin_job_retry", { p_job: queued, p_reason: "Queued is not retryable" })).error)).toBe("");   // cancelled → replayable
    await db.from("job_queue").update({ status: "cancelled", run_after: far }).eq("id", queued);

    const ev = async (published: boolean) => { const { data, error: e } = await db.from("domain_outbox").insert({ event_type: "support.case_opened", payload: { q31: tag }, ...(published ? { published_at: new Date().toISOString(), publish_attempts: 1 } : { last_error: "q31 predicate", publish_attempts: 3 }) }).select("id").single(); if (e) throw e; outbox.push(data!.id); return data!.id as string; };
    const unpublished = await ev(false), done = await ev(true);
    await ins({ status: "dead", consumer: `q31.${tag}`, event_id: done, finished_at: new Date().toISOString() });
    await db.from("consumer_inbox").insert({ consumer: `q31.${tag}`, event_id: done });
    expect(msg((await lead.c.rpc("admin_outbox_replay", { p_event: done, p_reason: "Consumer already ran" })).error)).toBe("nothing_to_replay");
    // Mark the unpublished row published before replaying would re-fan it; replay only clears its error.
    expect(msg((await lead.c.rpc("admin_outbox_replay", { p_event: unpublished, p_reason: "Predicate fixed" })).error)).toBe("");
    const { data: o } = await db.from("domain_outbox").select("last_error").eq("id", unpublished).single();
    expect(o!.last_error).toBeNull();
    await db.from("domain_outbox").update({ published_at: new Date().toISOString() }).eq("id", unpublished);
    await db.from("consumer_inbox").delete().eq("consumer", `q31.${tag}`);
    const { count } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("actor_id", lead.id).like("event", "ops.%");
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("review scopes: Trust reads evidence, ticket flag review needs a reason, evidence decisions are Trust-only", async () => {
    // Disposable provider workspace + one submitted document (no live provider has uploaded evidence yet: Q38 seed gap).
    const owner = await createUser("q31-prov");
    const ws = await seedWorkspace(owner.id, "provider", `Q31 Provider ${tag}`);
    const { data: doc, error: de } = await db.from("provider_documents").insert({ workspace_id: ws, credential_key: "public_liability", file_path: `${owner.id}/${crypto.randomUUID()}.pdf`, file_name: "q31-insurance.pdf", status: "submitted", uploaded_by: owner.id }).select("id").single();
    expect(de).toBeNull();
    const { data: d1 } = await lead.c.from("provider_documents").select("id").eq("id", doc!.id);
    const { data: d2 } = await sup.c.from("provider_documents").select("id").eq("id", doc!.id);
    expect(d1 ?? []).toHaveLength(1);
    expect(d2 ?? []).toHaveLength(0);
    expect(msg((await sup.c.rpc("trust_review_document", { p_document: doc!.id, p_status: "in_review", p_reason_code: null, p_reason: null, p_expires_on: null, p_cover_amount_minor: null })).error)).toBe("not_authorized");
    expect(msg((await lead.c.rpc("trust_review_document", { p_document: doc!.id, p_status: "verified", p_reason_code: null, p_reason: null, p_expires_on: null, p_cover_amount_minor: null })).error)).toContain("file_not_cleared");
    expect(msg((await lead.c.rpc("trust_review_document", { p_document: doc!.id, p_status: "in_review", p_reason_code: null, p_reason: null, p_expires_on: null, p_cover_amount_minor: null })).error)).toBe("");
    await db.from("provider_documents").delete().eq("id", doc!.id);
    await db.from("workspaces").delete().eq("id", ws);
    expect(msg((await lead.c.rpc("ticket_risk_review", { p_flag: crypto.randomUUID(), p_status: "cleared", p_note: "" })).error)).toBe("reason_required");
    expect(msg((await lead.c.rpc("ticket_risk_review", { p_flag: crypto.randomUUID(), p_status: "cleared", p_note: "Checked by phone" })).error)).toBe("not_found");
    const { data: counts } = await lead.c.rpc("admin_review_counts");
    expect(counts).toHaveProperty("documents"); expect(counts).toHaveProperty("dead_jobs");
    const { data: sc } = await sup.c.rpc("admin_review_counts");
    expect((sc as { documents: number | null }).documents).toBeNull();
    expect(msg((await cust.c.rpc("admin_review_counts")).error)).toBe("not_authorized");
  });

  test("health contract: public liveness only; ops bearer adds weather, virtual, calendar_sync, e_signature and queue", async ({ request }) => {
    const pub = await request.get(`${BASE}/api/health`);
    expect(pub.ok()).toBe(true);
    const p = await pub.json();
    expect(p).toHaveProperty("db"); expect(p).not.toHaveProperty("contracts");
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET not available to the test process");
    const res = await request.get(`${BASE}/api/health`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(res.ok()).toBe(true);
    const j = await res.json();
    for (const k of ["weather", "virtual", "calendar_sync", "e_signature", "queue", "mailbox", "clamav", "r2"]) expect(j.contracts).toHaveProperty(k);
    expect(j.contracts.queue).toHaveProperty("state");
    expect(JSON.stringify(j)).not.toMatch(/sk_(live|test)_|eyJhbGci/);
    const { data: snap } = await db.from("service_health_snapshots").select("taken_at").order("taken_at", { ascending: false }).limit(1);
    expect(Date.now() - new Date((snap ?? [])[0]!.taken_at).getTime()).toBeLessThan(5 * 60_000);
  });
});
