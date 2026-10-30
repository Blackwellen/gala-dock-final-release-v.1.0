import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace } from "../phase1/helpers";
import { EVENT_CATALOGUE } from "../../src/lib/foundation/event-catalogue";
import { IdempotencyError, claimJobs, dbNow, emitDomainEvent, enqueueJob, retryDeadJob, runDbJobs, transitionState, withIdempotency, type Job } from "../../src/lib/foundation";

// Q03 exit gate — durable retry/replay: replaying a command, event or job never repeats a side effect; a crashed worker's
// lease expires and the job is reclaimed and completed once; jobs dead-letter after max attempts and can be replayed; an
// outbox row exists only when its domain transaction commits.
const db = admin as unknown as SupabaseClient;
const cron = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const job = async (id: string) => (await db.from("job_queue").select("*").eq("id", id).single()).data as Job & { result: Record<string, unknown> | null; locked_by: string | null };
const waitForDb = async (until: Date) => { for (let i = 0; i < 40 && (await dbNow(db)) <= until; i++) await sleep(250); };
const appWorker = (request: { post: (url: string, o: object) => Promise<{ status(): number; json(): Promise<unknown> }> }) =>
  request.post(`${BASE}/api/cron/jobs?kinds=system.canary`, { headers: cron, timeout: 60_000 });

test.describe.configure({ mode: "serial" });

test.describe("Q03 workflow / state / queue foundation", () => {
  let owner: { id: string; email: string }, ws: string;
  const canaryKeys: string[] = [];
  test.beforeAll(async () => {
    owner = await createUser("wf-owner");
    ws = await seedWorkspace(owner.id, "organizer", "Workflow Foundation Org");
  });
  test.afterAll(async () => {
    for (const k of canaryKeys) await db.from("job_queue").delete().eq("dedupe_key", k);
    await db.from("agent_routines").delete().eq("workspace_id", ws);
    await db.from("agent_runs").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);   // outbox, jobs and audit rows cascade with the workspace
    await cleanup();
  });

  test("event catalogue in the database equals src/lib/foundation/event-catalogue.ts", async () => {
    const { data } = await db.from("domain_event_types").select("event_type,schema_version,aggregate,public_type").eq("active", true);
    expect((data as { event_type: string; schema_version: number; aggregate: string; public_type: string | null }[]).map(e => `${e.event_type}|${e.schema_version}|${e.aggregate}|${e.public_type ?? ""}`).sort())
      .toEqual(EVENT_CATALOGUE.map(e => `${e.type}|${e.schemaVersion}|${e.aggregate}|${e.publicType ?? ""}`).sort());
  });

  test("outbox rows exist only when the domain transaction commits; envelope carries correlation and causation", async () => {
    const marker = randomUUID();
    // One statement, two rows: the second violates NOT NULL, so the whole transaction (and its outbox capture) rolls back.
    const bad = await db.from("audit_events").insert([{ actor_id: owner.id, actor_type: "user", workspace_id: ws, event: "event.updated", metadata: { marker } }, { actor_id: owner.id, workspace_id: ws, event: null }] as never);
    expect(bad.error).not.toBeNull();
    expect((await db.from("domain_outbox").select("id").eq("workspace_id", ws).contains("payload", { marker })).data).toEqual([]);

    const corr = `cor_test_${marker.slice(0, 8)}`;
    const { data: a } = await db.from("audit_events").insert({ actor_id: owner.id, actor_type: "user", workspace_id: ws, event: "event.updated", metadata: { marker, ip: "9.9.9.9" }, correlation_id: corr } as never).select("id").single();
    const { data: rows } = await db.from("domain_outbox").select("event_type,schema_version,actor_id,actor_type,correlation_id,causation_id,payload,aggregate_type").eq("workspace_id", ws).contains("payload", { marker });
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ event_type: "event.updated", schema_version: 1, actor_id: owner.id, actor_type: "user", correlation_id: corr, causation_id: `audit:${(a as { id: number }).id}`, aggregate_type: "event" });
    expect(JSON.stringify(rows![0]!.payload)).not.toContain("9.9.9.9");   // sanitised like webhooks
    // Uncatalogued events with no listener are not captured.
    await db.from("audit_events").insert({ actor_id: owner.id, workspace_id: ws, event: "listing.viewed_internal", metadata: { marker } } as never);
    expect((await db.from("domain_outbox").select("id").eq("workspace_id", ws).eq("event_type", "listing.viewed_internal")).data).toEqual([]);
  });

  test("transition_state: illegal transitions and stale expectations write nothing; legal ones write the state and one outbox event atomically", async () => {
    // A stepless 'scheduled' run is never claimed by the agent worker, so nothing else moves it during the test.
    const { data: run } = await db.from("agent_runs").insert({ workspace_id: ws, user_id: owner.id, goal: "Q03 transition test", status: "scheduled" } as never).select("id").single();
    const id = (run as { id: string }).id;
    const events = async () => (await db.from("domain_outbox").select("payload").eq("aggregate_id", id).eq("event_type", "agent_run.state_changed")).data!.length;
    await expect(transitionState(db, "agent_run", id, "completed")).rejects.toThrow(/illegal agent_run transition scheduled -> completed/);
    expect(await events()).toBe(0);
    expect(await transitionState(db, "agent_run", id, "paused", { expected: "queued" })).toEqual({ ok: false, conflict: true, current: "scheduled" });
    expect(await events()).toBe(0);
    const ok = await transitionState(db, "agent_run", id, "paused", { expected: "scheduled", actorId: owner.id, actorType: "user", reason: "test" });
    expect(ok).toMatchObject({ ok: true, changed: true, from: "scheduled", to: "paused" });
    expect(await events()).toBe(1);
    expect((await db.from("agent_runs").select("status").eq("id", id).single()).data).toEqual({ status: "paused" });
    expect((await transitionState(db, "agent_run", id, "paused")).ok).toBe(true);   // no-op: no second event
    expect(await events()).toBe(1);
    await transitionState(db, "agent_run", id, "cancelled");
  });

  test("replaying an event (re-publish) or a finished job never repeats the side effect (routine wake proof flow)", async () => {
    const far = "2999-01-01T00:00:00Z";
    const { data: r } = await db.from("agent_routines").insert({ workspace_id: ws, owner_id: owner.id, title: "Q03 replay", detail: "x", schedule: "on booking.cancelled",
      trigger: { type: "event", event: "booking.cancelled" }, actions: [], enabled: false, next_run_at: far }).select("id").single();
    const rid = (r as { id: string }).id;
    // Enabled only now so the production agent worker has no window to run it before we assert.
    await db.from("agent_routines").update({ enabled: true }).eq("id", rid);
    const marker = randomUUID();
    await db.from("audit_events").insert({ actor_id: owner.id, actor_type: "user", workspace_id: ws, event: "booking.cancelled", metadata: { marker } } as never);
    const { data: o } = await db.from("domain_outbox").select("id").eq("workspace_id", ws).contains("payload", { marker }).single();
    const eventId = (o as { id: string }).id;
    await runDbJobs(db);
    const jobs = async () => (await db.from("job_queue").select("id,status,result,attempts").eq("event_id", eventId)).data as { id: string; status: string; result: Record<string, unknown>; attempts: number }[];
    let js = await jobs();
    expect(js).toHaveLength(1);
    expect(js[0]).toMatchObject({ status: "succeeded", result: { woken: 1 } });
    const woke = (await db.from("agent_routines").select("next_run_at,last_event").eq("id", rid).single()).data as { next_run_at: string; last_event: { event_id: string } };
    expect(new Date(woke.next_run_at).getTime()).toBeLessThanOrEqual((await dbNow(db)).getTime());
    expect(woke.last_event.event_id).toBe(eventId);

    // Park the routine again (no debounce in play), then replay twice.
    await db.from("agent_routines").update({ next_run_at: far, last_run_at: null, last_event: null }).eq("id", rid);
    await db.from("domain_outbox").update({ published_at: null }).eq("id", eventId);          // 1. the relay publishes the same event again
    await runDbJobs(db);
    js = await jobs();
    expect(js).toHaveLength(1);                                                                  //    → dedupe key: no second job
    await db.from("job_queue").update({ status: "queued", run_after: new Date(0).toISOString() }).eq("id", js[0]!.id);   // 2. the finished job runs again
    await runDbJobs(db);
    js = await jobs();
    expect(js[0]).toMatchObject({ status: "succeeded", result: { duplicate: true } });           //    → consumer inbox: handler skipped
    expect((await db.from("agent_routines").select("next_run_at").eq("id", rid).single()).data!.next_run_at).toContain("2999");
    expect((await db.from("consumer_inbox").select("job_id").eq("consumer", "agent.routine_wake").eq("event_id", eventId)).data).toHaveLength(1);
    await db.from("agent_routines").update({ enabled: false }).eq("id", rid);
  });

  test("crash/resume: a job whose worker died is reclaimed after its lease expires and completes exactly once (db and app runtimes)", async ({ request }) => {
    // db runtime (routine wake)
    const { data: r } = await db.from("agent_routines").insert({ workspace_id: ws, owner_id: owner.id, title: "Q03 crash", detail: "x", schedule: "on booking.confirmed",
      trigger: { type: "event", event: "booking.confirmed" }, actions: [], enabled: true, next_run_at: "2999-01-01T00:00:00Z" }).select("id").single();
    const rid = (r as { id: string }).id;
    const eventId = await emitDomainEvent(db, { type: "booking.confirmed", workspaceId: ws, actorId: owner.id, actorType: "user", payload: { q03: "crash" } });
    await db.rpc("publish_domain_outbox", { p_limit: 500 });
    const claimed = await claimJobs(db, "q03-crashed-worker", "db", { kinds: ["agent.routine_wake"], leaseSeconds: 1, limit: 50 });
    const mine = claimed.find(j => j.event_id === eventId);
    test.skip(!mine, "pg_cron ran this job between publish and claim (≈0.3% window); rerun");
    // The crashed worker never completes. Its lease expires on the database clock, then a healthy worker reclaims it.
    await waitForDb(new Date(mine!.lease_until!));
    await runDbJobs(db, { kinds: ["agent.routine_wake"] });
    const done = await job(mine!.id);
    expect(done).toMatchObject({ status: "succeeded", attempts: 2, result: { woken: 1 } });
    expect(await db.rpc("complete_job", { p_job: mine!.id, p_worker: "q03-crashed-worker", p_result: {} }).then(x => x.data)).toBe(false);   // late completion from the dead worker is rejected
    expect((await db.from("consumer_inbox").select("job_id").eq("event_id", eventId)).data).toHaveLength(1);
    expect((await db.from("agent_routines").select("last_event").eq("id", rid).single()).data!.last_event).toMatchObject({ event_id: eventId });
    await db.from("agent_routines").update({ enabled: false }).eq("id", rid);

    // app runtime (TypeScript handler through /api/cron/jobs on the running app)
    const key = `q03-canary-crash-${randomUUID()}`; canaryKeys.push(key);
    const id = await enqueueJob(db, "system.canary", { echo: "resume" }, { dedupeKey: key, priority: 1 });
    expect(await enqueueJob(db, "system.canary", { echo: "resume" }, { dedupeKey: key, priority: 1 })).toBe(id);   // replayed command → same job
    const c2 = await claimJobs(db, "q03-crashed-app-worker", "app", { kinds: ["system.canary"], leaseSeconds: 1, limit: 50 });
    const appJob = c2.find(j => j.id === id)!;
    expect(appJob).toBeTruthy();
    await waitForDb(new Date(appJob.lease_until!));
    expect((await appWorker(request)).status()).toBe(200);
    expect(await job(id)).toMatchObject({ status: "succeeded", attempts: 2, result: { ok: true, attempt: 2, echo: "resume" } });
  });

  test("jobs dead-letter after max attempts with backoff, and an operator replay completes them", async ({ request }) => {
    const key = `q03-canary-dlq-${randomUUID()}`; canaryKeys.push(key);
    const id = await enqueueJob(db, "system.canary", { fail: true }, { dedupeKey: key, priority: 1 });
    const statuses: string[] = [];
    for (let i = 0; i < 3; i++) {
      await db.from("job_queue").update({ run_after: new Date(0).toISOString() }).eq("id", id).eq("status", "failed");   // skip the backoff wait
      expect((await appWorker(request)).status()).toBe(200);
      const j = await job(id); statuses.push(j.status);
      if (j.status === "failed") expect(new Date(j.run_after).getTime()).toBeGreaterThan((await dbNow(db)).getTime() - 1000);   // backoff scheduled in the future
    }
    expect(statuses).toEqual(["failed", "failed", "dead"]);
    const { data: dlq } = await db.from("dead_letter_jobs").select("id,attempts,last_error").eq("id", id);
    expect(dlq).toEqual([expect.objectContaining({ id, attempts: 3, last_error: expect.stringContaining("canary failure requested") })]);
    // Operator fixes the cause and replays it.
    await db.from("job_queue").update({ payload: { fail: false, echo: "replayed" } }).eq("id", id);
    expect(await retryDeadJob(db, id, "Q03 test: fixed payload")).toBe(true);
    expect((await appWorker(request)).status()).toBe(200);
    expect(await job(id)).toMatchObject({ status: "succeeded", attempts: 1, result: { echo: "replayed" } });
  });

  test("idempotency registry: a replayed command returns the stored response and runs once; conflicts and in-flight duplicates are refused", async () => {
    let runs = 0;
    const key = `q03-${randomUUID()}`;
    const cmd = () => withIdempotency(db, { scope: "test:q03", key, request: { amount: 10, to: "a" } }, async () => { runs++; await sleep(300); return { status: 201, body: { id: `obj-${runs}` } }; });
    const [first, concurrent] = await Promise.allSettled([cmd(), sleep(80).then(cmd)]);
    expect(first.status === "fulfilled" && first.value).toEqual({ replayed: false, status: 201, body: { id: "obj-1" } });
    expect(concurrent.status === "rejected" && (concurrent.reason as IdempotencyError).code).toBe("idempotency_in_progress");
    expect(await cmd()).toEqual({ replayed: true, status: 201, body: { id: "obj-1" } });
    expect(runs).toBe(1);
    await expect(withIdempotency(db, { scope: "test:q03", key, request: { amount: 99, to: "a" } }, async () => ({ status: 200, body: {} }))).rejects.toMatchObject({ code: "idempotency_conflict" });
    // A failing command releases its key, so a retry can succeed.
    const k2 = `q03-${randomUUID()}`;
    await expect(withIdempotency(db, { scope: "test:q03", key: k2, request: 1 }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await withIdempotency(db, { scope: "test:q03", key: k2, request: 1 }, async () => ({ status: 200, body: "ok" }))).toEqual({ replayed: false, status: 200, body: "ok" });
    await db.from("idempotency_keys").delete().eq("scope", "test:q03");
  });

  test("foundation tables and primitives are service-only", async () => {
    const { anon } = await import("../phase1/helpers");
    const a = anon() as unknown as SupabaseClient;
    for (const t of ["domain_outbox", "job_queue", "idempotency_keys", "consumer_inbox", "job_kinds", "event_subscriptions", "domain_event_types"]) {
      const { data } = await a.from(t).select("*").limit(1);
      expect(data ?? [], t).toEqual([]);
    }
    expect((await a.rpc("enqueue_job", { p_kind: "system.canary" })).error).not.toBeNull();
    expect((await a.rpc("run_db_jobs", {})).error).not.toBeNull();
    expect((await a.rpc("transition_state", { p_machine: "agent_run", p_id: randomUUID(), p_to: "running" })).error).not.toBeNull();
  });
});
