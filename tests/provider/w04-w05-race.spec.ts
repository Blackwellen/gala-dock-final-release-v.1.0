import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// W04 / W05 (v6 GD-05 / GD-06): same-slot races and cross-role assertions for venue and supplier providers.
// API level, as the browser would call it (RLS-scoped clients). Every record lives in a disposable workspace; nothing is
// published to the live marketplace except the one listing used for the visibility check, which is unpublished in afterAll.
// The three former test.fail() gaps (Q10/Q11/Q12) were closed by migration 202610291023_booking_integrity and now run as normal tests.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const booking = (space: string | null, listing: string, starts: string, ends: string, extra: Record<string, unknown> = {}) =>
  ({ space_id: space, listing_id: listing, client_name: "Race client", event_name: "Race test", starts_at: starts, ends_at: ends, guests: 50, value: 1000, ...extra });

test.describe.configure({ mode: "serial" });
test.describe("W04/W05 provider races and cross-role", () => {
  let org: { id: string; email: string }, prov: { id: string; email: string };
  let orgC: SupabaseClient, provC: SupabaseClient;
  let ws: string, venue: string, dj: string, hall: string, terrace: string;
  const events: string[] = [];
  const newEvent = async (name: string, starts: string, ends: string) => {
    const id = ((await db.from("events").insert({ owner_id: org.id, name, starts_at: starts, ends_at: ends }).select("id").single()).data as { id: string }).id;
    events.push(id); return id;
  };
  const newItem = async (event: string, listing: string, status: string, extra: Record<string, unknown> = {}) =>
    ((await db.from("build_items").insert({ event_id: event, listing_id: listing, category: listing === dj ? "dj" : "venue", title: "Race item", status, amount: 2000, ...extra }).select("id").single()).data as { id: string }).id;

  test.beforeAll(async () => {
    [org, prov] = await Promise.all([createUser("w04-org"), createUser("w04-prov")]);
    ws = await seedWorkspace(prov.id, "provider", "W04 Race Venue");
    await db.from("workspaces").update({ capabilities: ["venue", "service"] }).eq("id", ws);
    venue = ((await db.from("listings").insert({ workspace_id: ws, name: "W04 Race Venue", kind: "venue", category: "venue", published: false }).select("id").single()).data as { id: string }).id;
    dj = ((await db.from("listings").insert({ workspace_id: ws, name: "W05 Race DJ", kind: "service", category: "dj", published: false }).select("id").single()).data as { id: string }).id;
    const sp = async (name: string) => ((await db.from("spaces").insert({ workspace_id: ws, venue_id: venue, name, capacity_seated: 120, turnaround_minutes: 60 }).select("id").single()).data as { id: string }).id;
    hall = await sp("Hall"); terrace = await sp("Terrace");
    [orgC, provC] = await Promise.all([signedIn(org.email), signedIn(prov.email)]) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("listings").update({ published: false }).eq("workspace_id", ws);
    await db.from("provider_quotes").delete().eq("workspace_id", ws);
    await db.from("provider_jobs").delete().eq("workspace_id", ws);
    await db.from("availability_blocks").delete().eq("workspace_id", ws);
    for (const e of events) { await db.from("build_items").delete().eq("event_id", e); await db.from("events").delete().eq("id", e); }
    await db.from("spaces").delete().eq("workspace_id", ws);
    await db.from("listings").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("GD-05 two simultaneous direct bookings for the same space and time: exactly one wins", async () => {
    const [a, b] = await Promise.all([0, 1].map(() => provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(20, 18), at(20, 23)) })));
    const ok = [a, b].filter(r => !r.error), refused = [a, b].filter(r => r.error);
    expect(ok).toHaveLength(1);
    expect(refused[0].error?.message).toMatch(/hard_conflict|turnaround_conflict/);
    const { count } = await db.from("provider_jobs").select("id", { count: "exact", head: true }).eq("space_id", hall).in("status", ["held", "confirmed", "active"]);
    expect(count).toBe(1);
  });

  test("GD-05 a hold and a confirmation racing for the same slot: one is refused", async () => {
    const [a, b] = await Promise.all([
      provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(21, 12), at(21, 16), { hold: "true" }) }),
      provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(21, 13), at(21, 17)) }),
    ]);
    expect([a, b].filter(r => !r.error)).toHaveLength(1);
  });

  test("GD-05 turnaround buffer is enforced and a cancelled booking frees the slot", async () => {
    const first = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(22, 10), at(22, 14)) });
    expect(first.error).toBeNull();
    const tooClose = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(22, 14), at(22, 16)) }); // 60-min turnaround
    expect(tooClose.error?.message).toMatch(/hard_conflict|turnaround_conflict/); // the trigger's 23P01 surfaces as hard_conflict
    expect((await provC.rpc("provider_job_transition", { p_job: first.data, p_to: "cancelled", p_reason: "W04 race test release" })).error).toBeNull();
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(22, 10), at(22, 14)) })).error).toBeNull();
  });

  test("GD-06 a declined request does not hold capacity", async () => {
    const e = await newEvent("Declined request", at(23, 18), at(23, 23));
    await newItem(e, venue, "declined");
    expect((await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(23, 18), at(23, 23)) })).error).toBeNull();
  });

  test("GD-06 a quote revision is what the organiser sees", async () => {
    const e = await newEvent("Quote visibility", at(30, 18), at(30, 23));
    const item = await newItem(e, venue, "sent", { response_deadline: at(3, 12) });
    const line = (price: number) => [{ label: "Hall hire", detail: "", qty: 1, unit: "fixed", unit_price: price, kind: "venue" }];
    const draft = async (price: number) => {
      const d = await provC.rpc("provider_save_quote_draft", { p_item: item, p_quote: null, p_items: line(price), p_tax_bps: 0, p_deposit_pct: 25, p_valid_days: 14, p_terms: {}, p_message: "W04" });
      expect(d.error).toBeNull();
      expect((await provC.rpc("provider_send_quote", { p_quote: d.data })).error).toBeNull();
      return d.data as string;
    };
    await draft(2400);
    const seen1 = await orgC.from("build_items").select("status,amount,quote").eq("id", item).single();
    expect(seen1.data).toMatchObject({ status: "quoted", amount: 2400 });
    const q2 = await draft(2650);
    const seen2 = await orgC.from("build_items").select("amount,quote").eq("id", item).single();
    expect(seen2.data?.amount).toBe(2650);
    expect((seen2.data?.quote as { quote_id: string; version: number }).quote_id).toBe(q2);
    const { data: versions } = await db.from("provider_quotes").select("status").eq("build_item_id", item).order("version");
    expect(versions?.map(v => v.status)).toEqual(["superseded", "sent"]);
  });

  test("GD-06 published listings are visible to the public; drafts are not", async () => {
    const before = await anon().from("listings").select("id").eq("id", dj);
    expect(before.data ?? []).toHaveLength(0);
    await db.from("listings").update({ published: true }).eq("id", dj);
    const after = await anon().from("listings").select("id,name").eq("id", dj);
    expect(after.data?.[0]?.name).toBe("W05 Race DJ");
    await db.from("listings").update({ published: false }).eq("id", dj);
  });

  test("Q11: a blocked/maintenance window stops a direct booking", async () => {
    expect((await provC.rpc("provider_set_availability", { p_ws: ws, p_kind: "maintenance", p_starts: at(24, 8), p_ends: at(24, 20), p_listing: null, p_space: terrace, p_crew: null, p_note: "W04" })).error).toBeNull();
    const r = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(terrace, venue, at(24, 10), at(24, 12)) });
    expect(r.error?.message, "booking accepted inside a maintenance block").toBe("blocked_conflict");
  });

  test("Q10: a marketplace-confirmed venue booking occupies the space calendar", async () => {
    // Deposit webhook path (apply_payment → build_items.status = 'confirmed') emulated with a status update; the job trigger is what is under test.
    const e = await newEvent("Marketplace confirm", at(25, 18), at(25, 23));
    const item = await newItem(e, venue, "quoted");
    expect((await db.from("build_items").update({ status: "confirmed" }).eq("id", item)).error).toBeNull();
    const { data: job } = await db.from("provider_jobs").select("space_id").eq("build_item_id", item).single();
    const direct = await provC.rpc("provider_create_booking", { p_ws: ws, p: booking(hall, venue, at(25, 18), at(25, 23)) });
    expect(job?.space_id ?? direct.error, "marketplace job has no space and the same slot was sold again").toBeTruthy();
    expect(direct.error?.message).toBe("venue_conflict"); // no space resolvable for a two-space venue → the job holds the whole venue
  });

  test("Q12: a solo supplier is not confirmed for two overlapping jobs", async () => {
    const [e1, e2] = await Promise.all([newEvent("DJ A", at(26, 18), at(26, 23)), newEvent("DJ B", at(26, 19), at(26, 22))]);
    const [i1, i2] = await Promise.all([newItem(e1, dj, "quoted"), newItem(e2, dj, "quoted")]);
    const r = await Promise.all([i1, i2].map(i => db.from("build_items").update({ status: "confirmed" }).eq("id", i)));
    expect(r.filter(x => x.error), "both overlapping supplier jobs were confirmed").toHaveLength(1);
    expect(r.find(x => x.error)?.error?.message).toBe("capacity_conflict");
  });
});
