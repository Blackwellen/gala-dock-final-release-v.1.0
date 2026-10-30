import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q10/Q11/Q12 booking integrity (migration 202610291023). API level with disposable identities; every assertion that is about
// authorization uses an RLS-scoped client. The service role only sets up fixtures and plays the Stripe webhook
// (payment_order_succeeded is service-only, as in production).
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number, m = 0) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };

test.describe.configure({ mode: "serial" });
test.describe("Q10–Q12 booking integrity", () => {
  let org: { id: string; email: string }, prov: { id: string; email: string }, other: { id: string; email: string };
  let orgC: SupabaseClient, provC: SupabaseClient, otherC: SupabaseClient;
  let ws: string, otherWs: string, venue: string, dj: string, band: string, hall: string, terrace: string, loft: string, mezz: string;
  const events: string[] = [];
  const booking = (space: string | null, listing: string, starts: string, ends: string, extra: Record<string, unknown> = {}) =>
    ({ space_id: space, listing_id: listing, client_name: "Integrity client", event_name: "Integrity test", starts_at: starts, ends_at: ends, guests: 40, value: 900, ...extra });
  const newEvent = async (name: string, starts: string, ends: string) => {
    const { id } = await one(db.from("events").insert({ owner_id: org.id, name, starts_at: starts, ends_at: ends }).select("id").single());
    events.push(id); return id;
  };
  const newItem = async (event: string, listing: string, status: string, extra: Record<string, unknown> = {}) =>
    (await one(db.from("build_items").insert({ event_id: event, listing_id: listing, category: listing === venue ? "venue" : "dj", title: "Integrity item", status, amount: 2000, ...extra }).select("id").single())).id;
  const newRequest = async (event: string, requirements: Record<string, unknown>) =>
    (await one(db.from("provider_requests").insert({ event_id: event, created_by: org.id, category: "venue", title: "Integrity request", requirements, status: "sent" }).select("id").single())).id;
  const ledgerFixture = async () => {
    const found = (await db.from("workspaces").select("id").eq("name", "Q10 Ledger Fixture (tests)").maybeSingle()).data as { id: string } | null;
    let fws = found?.id;
    if (!fws) {
      const { data, error } = await admin.auth.admin.createUser({ email: `q10-ledger-fixture-${randomUUID().slice(0, 8)}@gala-dock.test`, password: randomUUID(), email_confirm: true });
      if (error) throw error;
      fws = (await one(db.from("workspaces").insert({ owner_id: data.user.id, kind: "provider", name: "Q10 Ledger Fixture (tests)", capabilities: ["venue"], settings: {}, is_test_fixture: true } as never).select("id").single())).id;
      await one(db.from("events").insert({ owner_id: data.user.id, name: "Q10 ledger anchor (tests)" }).select("id").single());
    }
    const ev = (await one(db.from("events").select("id").eq("name", "Q10 ledger anchor (tests)").order("created_at").limit(1).single())).id;
    return { ws: fws, event: ev };
  };
  const job = (item: string) => db.from("provider_jobs").select("id,space_id,status,details").eq("build_item_id", item).maybeSingle();

  test.beforeAll(async () => {
    [org, prov, other] = await Promise.all([createUser("q10-org"), createUser("q10-prov"), createUser("q10-other")]);
    ws = await seedWorkspace(prov.id, "provider", "Q10 Integrity Venue");
    otherWs = await seedWorkspace(other.id, "provider", "Q10 Other Provider");
    await db.from("workspaces").update({ capabilities: ["venue", "service"] }).eq("id", ws);
    venue = (await one(db.from("listings").insert({ workspace_id: ws, name: "Q10 Integrity Venue", kind: "venue", category: "venue", published: false }).select("id").single())).id;
    dj = (await one(db.from("listings").insert({ workspace_id: ws, name: "Q12 Solo DJ", kind: "service", category: "dj", published: false }).select("id").single())).id;
    band = (await one(db.from("listings").insert({ workspace_id: ws, name: "Q12 Band", kind: "service", category: "band", published: false }).select("id").single())).id;
    const sp = async (name: string, extra: Record<string, unknown> = {}) =>
      (await one(db.from("spaces").insert({ workspace_id: ws, venue_id: venue, name, capacity_seated: 120, turnaround_minutes: 30, ...extra }).select("id").single())).id;
    hall = await sp("Hall", { details: { setup_minutes: 60 } }); terrace = await sp("Terrace"); loft = await sp("Loft", { exclusive_group: "upper" }); mezz = await sp("Mezzanine", { exclusive_group: "upper", layouts: { theatre: 30 } });
    [orgC, provC, otherC] = await Promise.all([signedIn(org.email), signedIn(prov.email), signedIn(other.email)]) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("booking_conflicts").delete().eq("workspace_id", ws);
    await db.from("booking_cancellations").delete().eq("workspace_id", ws);
    for (const e of events) await db.from("payment_orders").delete().in("build_item_id", ((await db.from("build_items").select("id").eq("event_id", e)).data ?? []).map(r => r.id));
    await db.from("shifts").delete().eq("workspace_id", ws);
    await db.from("provider_jobs").delete().eq("workspace_id", ws);
    await db.from("provider_quotes").delete().eq("workspace_id", ws);
    await db.from("availability_blocks").delete().eq("workspace_id", ws);
    await db.from("conditional_holds").delete().eq("workspace_id", ws);
    for (const e of events) {
      await db.from("payments").delete().eq("event_id", e);
      await db.from("build_items").delete().eq("event_id", e);
      await db.from("provider_requests").delete().eq("event_id", e);
      await db.from("events").delete().eq("id", e);
    }
    await db.from("crew_members").delete().eq("workspace_id", ws);
    await db.from("spaces").delete().eq("workspace_id", ws);
    await db.from("listings").delete().eq("workspace_id", ws);
    for (const w of [ws, otherWs]) await db.from("workspaces").delete().eq("id", w);
    await cleanup();
  });

  test("Q10 the requested space is carried to the job; the same space then refuses a direct sale, another space does not", async () => {
    const e = await newEvent("Space carry", at(40, 18), at(40, 22));
    const req = await newRequest(e, { space_id: terrace });
    const item = await newItem(e, venue, "quoted", { request_id: req });
    expect((await db.from("build_items").update({ status: "confirmed" }).eq("id", item)).error).toBeNull();
    expect((await job(item)).data).toMatchObject({ space_id: terrace, details: { occupancy: "space", space_source: "request" } });
    expect((await db.from("build_items").select("space_id").eq("id", item).single()).data?.space_id).toBe(terrace);
    const same = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(40, 19), at(40, 21)) });
    expect(same.error?.message).toBe("turnaround_conflict");
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(40, 18), at(40, 22)) })).error).toBeNull();
  });

  test("Q10 a space named on the sent quote is carried to the job", async () => {
    const e = await newEvent("Quote space", at(41, 12), at(41, 16));
    const item = await newItem(e, venue, "sent", { response_deadline: at(3, 12) });
    const d = await provC.rpc("provider_save_quote_draft", { p_item: item, p_quote: null, p_items: [{ label: "Hire", detail: "", qty: 1, unit: "fixed", unit_price: 1500, kind: "venue" }],
      p_tax_bps: 0, p_deposit_pct: 25, p_valid_days: 14, p_terms: { space_id: hall }, p_message: "Q10" });
    expect(d.error).toBeNull();
    expect((await provC.rpc("provider_send_quote", { p_quote: d.data })).error).toBeNull();
    expect((await db.from("build_items").update({ status: "confirmed" }).eq("id", item)).error).toBeNull();
    expect((await job(item)).data).toMatchObject({ space_id: hall, details: { space_source: "quote" } });
  });

  test("Q10 two marketplace confirmations racing for the same space: exactly one becomes a job", async () => {
    const [e1, e2] = await Promise.all([newEvent("Race A", at(42, 18), at(42, 23)), newEvent("Race B", at(42, 19), at(42, 22))]);
    const [r1, r2] = await Promise.all([newRequest(e1, { space_id: hall }), newRequest(e2, { space_id: hall })]);
    const [i1, i2] = await Promise.all([newItem(e1, venue, "quoted", { request_id: r1 }), newItem(e2, venue, "quoted", { request_id: r2 })]);
    const res = await Promise.all([i1, i2].map(i => db.from("build_items").update({ status: "confirmed" }).eq("id", i)));
    expect(res.filter(r => r.error)).toHaveLength(1);
    expect(res.find(r => r.error)?.error?.message).toMatch(/turnaround_conflict|hard_conflict/);
    const { count } = await db.from("provider_jobs").select("id", { count: "exact", head: true }).eq("space_id", hall).gte("starts_at", at(42, 0)).lt("starts_at", at(43, 0));
    expect(count).toBe(1);
  });

  test("Q10 a deposit paid after the slot was sold directly is not double-booked: conflict, refund queued, both notified", async () => {
    const e = await newEvent("Paid after taken", at(43, 18), at(43, 23));
    const direct = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(43, 17), at(43, 23)) });
    expect(direct.error).toBeNull();
    const req = await newRequest(e, { space_id: hall });
    const item = await newItem(e, venue, "awaiting_payment", { request_id: req });
    // The ledger is immutable and FK-bound to its workspace/event, so the memo posting goes to a persistent test fixture
    // (created once; never a real seller) instead of the disposable workspace, which can then be deleted.
    const fx = await ledgerFixture();
    const po = await one<{ reference: string }>(db.from("payment_orders").insert({ kind: "deposit", status: "amount_due", event_id: fx.event, build_item_id: item, payee_workspace_id: fx.ws,
      description: "Deposit — Q10 conflict", amount_minor: 50000, idempotency_key: `q10:${item}` }).select("reference").single());
    const pi = `pi_q10${randomUUID().slice(0, 8)}`;
    const applied = await db.rpc("payment_order_succeeded", { p_ref: po.reference, p_pi: pi, p_charge: `ch_${pi}`, p_amount_minor: 50000, p_livemode: false });
    expect(applied.error).toBeNull();
    expect(applied.data).toBe("applied");                                                   // the payment is recorded, never lost
    expect((await db.from("build_items").select("status").eq("id", item).single()).data?.status).toBe("replacement_required");
    expect((await job(item)).data).toBeNull();                                              // no second job for the slot
    const { data: conflict } = await db.from("booking_conflicts").select("id,kind,status,payment_order_ref,cancellation_id").eq("build_item_id", item).single();
    expect(conflict).toMatchObject({ kind: "turnaround_conflict", status: "refund_queued", payment_order_ref: po.reference });
    const { data: cancel } = await db.from("booking_cancellations").select("party,kind,status,refund_status,calculation").eq("id", conflict!.cancellation_id).single();
    expect(cancel).toMatchObject({ party: "platform", kind: "full", status: "completed", refund_status: "due", calculation: { refund_amount: 500 } });
    await db.from("booking_cancellations").update({ refund_status: "manual" }).eq("id", conflict!.cancellation_id); // keep the live refund worker off a fake PaymentIntent
    const { count: jobs } = await db.from("provider_jobs").select("id", { count: "exact", head: true }).eq("space_id", hall).in("status", ["held", "confirmed", "active"]).gte("starts_at", at(43, 0)).lt("starts_at", at(44, 0));
    expect(jobs).toBe(1);
    const [provN, orgN] = await Promise.all([
      db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", prov.id).ilike("title", "Booking could not be confirmed%"),
      db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", org.id).ilike("title", "Booking not confirmed%")]);
    expect([provN.count, orgN.count]).toEqual([1, 1]);
    // Both sides can read the conflict; an unrelated provider cannot.
    expect((await provC.from("booking_conflicts").select("id").eq("id", conflict!.id)).data).toHaveLength(1);
    expect((await orgC.from("booking_conflicts").select("id").eq("id", conflict!.id)).data).toHaveLength(1);
    expect((await otherC.from("booking_conflicts").select("id").eq("id", conflict!.id)).data).toHaveLength(0);
    expect((await otherC.rpc("resolve_booking_conflict", { p_conflict: conflict!.id, p_status: "resolved", p_note: "x" })).error).not.toBeNull();
    expect((await provC.rpc("resolve_booking_conflict", { p_conflict: conflict!.id, p_status: "resolved", p_note: "Customer moved to Terrace" })).error).toBeNull();
    await db.from("payments").delete().eq("build_item_id", item);
    await db.from("transactions").delete().eq("source_type", "payment_order").eq("description", "Deposit — Q10 conflict");
  });

  test("Q10 a whole-venue job narrows to one space when the provider assigns it", async () => {
    const e = await newEvent("Whole venue", at(44, 18), at(44, 22));
    const item = await newItem(e, venue, "quoted");
    expect((await db.from("build_items").update({ status: "confirmed" }).eq("id", item)).error).toBeNull();
    const j = (await job(item)).data!;
    expect(j).toMatchObject({ space_id: null, details: { occupancy: "whole_venue" } });
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(44, 18), at(44, 20)) })).error?.message).toBe("venue_conflict");
    expect((await otherC.rpc("provider_assign_job_space", { p_job: j.id, p_space: hall })).error).not.toBeNull();
    expect((await provC.rpc("provider_assign_job_space", { p_job: j.id, p_space: hall })).error).toBeNull();
    expect((await db.from("build_items").select("space_id").eq("id", item).single()).data?.space_id).toBe(hall);
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(44, 18), at(44, 20)) })).error).toBeNull();
  });

  test("Q11 venue-wide blackout, setup minutes, exclusive groups, layout capacity and hard holds all stop a booking", async () => {
    // Venue-wide blackout (no space named) blocks every space.
    expect((await provC.rpc("provider_set_availability", { p_ws: ws, p_kind: "blocked", p_starts: at(45, 0), p_ends: at(45, 23), p_listing: venue, p_space: null, p_crew: null, p_note: "Private closure" })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(45, 10), at(45, 12)) })).error?.message).toBe("blocked_conflict");
    // An 'open' window is not a block.
    expect((await provC.rpc("provider_set_availability", { p_ws: ws, p_kind: "open", p_starts: at(46, 8), p_ends: at(46, 20), p_listing: null, p_space: terrace, p_crew: null, p_note: "" })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(46, 10), at(46, 12)) })).error).toBeNull();
    // Hall: 30 min turnaround + 60 min setup → a booking ending 80 minutes before is too close; 100 minutes is fine.
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(47, 14), at(47, 18)) })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(47, 19, 20), at(47, 22)) })).error?.message).toBe("turnaround_conflict");
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(47, 19, 40), at(47, 22)) })).error).toBeNull();
    // Loft and Mezzanine share an exclusive group.
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(loft, venue, at(48, 18), at(48, 22)) })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(mezz, venue, at(48, 19), at(48, 21), { guests: 20 }) })).error?.message).toBe("exclusive_conflict");
    // Layout-specific capacity: Mezzanine theatre = 30.
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(mezz, venue, at(49, 18), at(49, 22), { guests: 40, layout: "theatre" }) })).error?.message).toBe("over_capacity");
    // Another customer's hard hold on the space.
    const e = await newEvent("Hard hold", at(50, 18), at(50, 22));
    const held = await newItem(e, venue, "available");
    await one(db.from("conditional_holds").insert({ build_item_id: held, event_id: e, listing_id: venue, workspace_id: ws, space_id: terrace, window_start: at(50, 18), window_end: at(50, 22),
      requested_hours: 48, expires_at: at(5, 12), status: "held", blocking_level: "hard", source: "direct" }).select("id").single());
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(50, 19), at(50, 21)) })).error?.message).toBe("hold_conflict");
  });

  test("Q12 capacity rules: limit, travel buffer, warn policy, direct service booking, and only the command writes rules", async () => {
    // Direct service booking (new) honours the solo default.
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, dj, at(51, 18), at(51, 23), { mode: "service" }) })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, dj, at(51, 20), at(51, 22), { mode: "service" }) })).error?.message).toBe("capacity_conflict");
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, dj, at(52, 18), at(52, 23), { mode: "service" }) })).error?.message).toBe("space_not_allowed_for_service");
    // Travel buffer: 60 min either side.
    expect((await provC.rpc("provider_set_capacity_rule", { p_ws: ws, p: { scope: "listing", listing_id: dj, concurrent_limit: 1, travel_minutes: 60 } })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, dj, at(51, 23, 30), at(52, 2), { mode: "service" }) })).error?.message).toBe("capacity_conflict");
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, dj, at(52, 0, 30), at(52, 2), { mode: "service" }) })).error).toBeNull();
    // A band with two crews: limit 2, three concurrent attempts → exactly two win.
    expect((await provC.rpc("provider_set_capacity_rule", { p_ws: ws, p: { scope: "listing", listing_id: band, concurrent_limit: 2 } })).error).toBeNull();
    const three = await Promise.all([0, 1, 2].map(() => provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, band, at(53, 18), at(53, 23), { mode: "service" }) })));
    expect(three.filter(r => !r.error)).toHaveLength(2);
    // Warn policy: allowed, flagged on the job.
    expect((await provC.rpc("provider_set_capacity_rule", { p_ws: ws, p: { scope: "listing", listing_id: band, concurrent_limit: 2, policy: "warn" } })).error).toBeNull();
    const warned = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, band, at(53, 19), at(53, 22), { mode: "service" }) });
    expect(warned.error).toBeNull();
    expect((await db.from("provider_jobs").select("details").eq("id", warned.data).single()).data?.details).toMatchObject({ capacity_warning: { checks: [{ scope: "listing", limit: 2, overlapping: 2 }] } });
    // Workspace-wide cap across all services.
    expect((await provC.rpc("provider_set_capacity_rule", { p_ws: ws, p: { scope: "workspace", concurrent_limit: 1 } })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, band, at(54, 10), at(54, 12), { mode: "service" }) })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(null, dj, at(54, 11), at(54, 13), { mode: "service" }) })).error?.message).toBe("capacity_conflict");
    expect((await provC.rpc("provider_set_capacity_rule", { p_ws: ws, p: { scope: "workspace", concurrent_limit: 1, active: false } })).error).toBeNull();
    // Rules are written only through the command, and only by the workspace.
    expect((await provC.from("provider_capacity_rules").insert({ workspace_id: ws, scope: "workspace", concurrent_limit: 99 })).error).not.toBeNull();
    expect((await otherC.rpc("provider_set_capacity_rule", { p_ws: ws, p: { scope: "workspace", concurrent_limit: 99 } })).error).not.toBeNull();
    expect((await otherC.from("provider_capacity_rules").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
    expect(((await provC.from("provider_capacity_rules").select("id").eq("workspace_id", ws)).data ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("Q12 a staff member cannot be double-shifted (race) or shifted while unavailable", async () => {
    const crew = (await one(db.from("crew_members").insert({ workspace_id: ws, name: "Q12 Solo Tech", role: "Technician" }).select("id").single())).id;
    const shift = (s: string, e: string) => db.from("shifts").insert({ workspace_id: ws, crew_id: crew, role: "Tech", title: "Q12", starts_at: s, ends_at: e, status: "pending" });
    const race = await Promise.all([shift(at(55, 18), at(55, 23)), shift(at(55, 20), at(55, 22))]);
    expect(race.filter(r => r.error)).toHaveLength(1);
    expect(race.find(r => r.error)?.error?.message).toBe("crew_conflict");
    expect((await provC.rpc("provider_set_availability", { p_ws: ws, p_kind: "blocked", p_starts: at(56, 0), p_ends: at(56, 23), p_listing: null, p_space: null, p_crew: crew, p_note: "Holiday" })).error).toBeNull();
    expect((await shift(at(56, 10), at(56, 12))).error?.message).toBe("crew_conflict");
    expect((await shift(at(57, 10), at(57, 12))).error).toBeNull();
  });
});
