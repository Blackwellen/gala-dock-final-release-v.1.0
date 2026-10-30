import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q10 exit gate (cards 108, 113–115; migration 202610291025): one event with a venue and two suppliers partially confirms and
// fails without corrupting the parent order group; a replacement recovers it. Also the Marketplace Request machine and the
// canonical bookings view. API level, disposable identities; the service role plays the deposit webhook (status → confirmed).
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type U = { id: string; email: string };

test.describe.configure({ mode: "serial" });
test.describe("Q10 multi-vendor order orchestration", () => {
  let org: U, vOwner: U, aOwner: U, bOwner: U, cOwner: U, stranger: U;
  let orgC: SupabaseClient, aC: SupabaseClient, bC: SupabaseClient, strangerC: SupabaseClient;
  let V: string, A: string, B: string, Cw: string, venue: string, djA: string, bandB: string, djC: string, event: string, group: string;
  let iV: string, iA: string, iB: string, iC: string;
  const wss: string[] = [];
  const item = async (listing: string, category: string, amount: number, extra: Record<string, unknown> = {}) =>
    (await one(db.from("build_items").insert({ event_id: event, listing_id: listing, category, title: `Q10 ${category}`, status: "quoted", amount, ...extra }).select("id").single())).id;
  const confirm = (i: string) => db.from("build_items").update({ status: "confirmed" }).eq("id", i);
  const groupRow = async () => one<{ status: string; totals: Record<string, unknown>; version: number }>(db.from("order_groups").select("status,totals,version").eq("id", group).single());

  test.beforeAll(async () => {
    [org, vOwner, aOwner, bOwner, cOwner, stranger] = await Promise.all(["q10o-org", "q10o-v", "q10o-a", "q10o-b", "q10o-c", "q10o-x"].map(l => createUser(l)));
    [V, A, B, Cw] = await Promise.all([seedWorkspace(vOwner.id, "provider", "Q10 Order Venue"), seedWorkspace(aOwner.id, "provider", "Q10 Supplier A"),
      seedWorkspace(bOwner.id, "provider", "Q10 Supplier B"), seedWorkspace(cOwner.id, "provider", "Q10 Supplier C")]);
    wss.push(V, A, B, Cw);
    await db.from("workspaces").update({ capabilities: ["service"] }).in("id", [A, B, Cw]);
    const listing = async (ws: string, name: string, kind: string, category: string) =>
      (await one(db.from("listings").insert({ workspace_id: ws, name, kind, category, published: false }).select("id").single())).id;
    venue = await listing(V, "Q10 Order Venue", "venue", "venue");
    await db.from("spaces").insert({ workspace_id: V, venue_id: venue, name: "Main Hall", capacity_seated: 200, turnaround_minutes: 60 });
    [djA, bandB, djC] = await Promise.all([listing(A, "Q10 DJ A", "service", "dj"), listing(B, "Q10 Band B", "service", "band"), listing(Cw, "Q10 DJ C", "service", "dj")]);
    event = (await one(db.from("events").insert({ owner_id: org.id, name: "Q10 Three-vendor gala", starts_at: at(60, 18), ends_at: at(60, 23) }).select("id").single())).id;
    [orgC, aC, bC, strangerC] = await Promise.all([org, aOwner, bOwner, stranger].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("order_groups").delete().eq("event_id", event);
    for (const ws of wss) await db.from("provider_jobs").delete().eq("workspace_id", ws);
    await db.from("build_items").delete().eq("event_id", event);
    await db.from("provider_requests").delete().eq("event_id", event);
    await db.from("events").delete().eq("id", event);
    for (const ws of wss) { await db.from("spaces").delete().eq("workspace_id", ws); await db.from("listings").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); }
    await cleanup();
  });

  test("Marketplace Request machine: request state follows its recipients (quote received ≠ declined ≠ no response)", async () => {
    const req = (await one(db.from("provider_requests").insert({ event_id: event, created_by: org.id, category: "dj", title: "Q10 DJ request", status: "sent" }).select("id").single())).id;
    const [r1, r2] = [await item(djA, "dj", 0, { request_id: req, status: "sent" }), await item(djC, "dj", 0, { request_id: req, status: "sent" })];
    const status = async () => (await one<{ status: string }>(db.from("provider_requests").select("status").eq("id", req).single())).status;
    expect(await status()).toBe("awaiting");
    await db.from("build_items").update({ status: "declined" }).eq("id", r1);
    expect(await status()).toBe("awaiting");                                         // one recipient still to answer
    await db.from("build_items").update({ status: "expired" }).eq("id", r2);
    expect(await status()).toBe("expired_no_response");                              // not collapsed into "declined"
    await db.from("build_items").update({ status: "sent" }).eq("id", r2);            // organiser resends
    expect((await db.from("provider_requests").update({ status: "sent" }).eq("id", req)).error).toBeNull();
    await db.from("build_items").update({ status: "quoted", amount: 900 }).eq("id", r2);
    expect(await status()).toBe("quote_received");
    expect((await orgC.from("provider_requests").select("status").eq("id", req).single()).data?.status).toBe("quote_received");
    await db.from("build_items").delete().in("id", [r1, r2]);
  });

  test("an unrelated user or a seller cannot create or read the buyer's order group", async () => {
    iV = await item(venue, "venue", 5000); iA = await item(djA, "dj", 800); iB = await item(bandB, "band", 1500);
    const payload = [{ build_item_id: iV }, { build_item_id: iA, depends_on: iV }, { build_item_id: iB, depends_on: iV }];
    expect((await strangerC.rpc("order_group_create", { p_event: event, p_items: payload })).error?.message).toMatch(/not_authorized/);
    expect((await aC.rpc("order_group_create", { p_event: event, p_items: payload })).error?.message).toMatch(/not_authorized/);
    const r = await orgC.rpc("order_group_create", { p_event: event, p_items: payload });
    expect(r.error).toBeNull();
    group = r.data as string;
    expect((await orgC.rpc("order_group_create", { p_event: event, p_items: [{ build_item_id: iA }] })).error?.message).toMatch(/item_already_grouped/);
    expect((await strangerC.from("order_groups").select("id").eq("id", group)).data).toHaveLength(0);
    expect((await aC.from("order_groups").select("id").eq("id", group)).data).toHaveLength(0);
    // Seller A sees only its own child row, never the other sellers' lines.
    expect(((await aC.from("order_group_items").select("build_item_id").eq("group_id", group)).data ?? []).map(x => x.build_item_id)).toEqual([iA]);
    expect((await groupRow()).status).toBe("open");
  });

  test("EXIT GATE: venue + supplier A confirm while supplier B fails; the parent stays consistent and recovers with a replacement", async () => {
    // Supplier B is a solo act already booked directly for the same evening.
    expect((await bC.rpc("provider_create_booking", { p_ws: B, p: { listing_id: bandB, mode: "service", client_name: "Other client", event_name: "Other gig",
      starts_at: at(60, 19), ends_at: at(60, 22), value: 1200 } })).error).toBeNull();
    // All three deposits land at the same moment.
    const res = await Promise.all([confirm(iV), confirm(iA), confirm(iB)]);
    expect(res.map(r => r.error?.message ?? "ok")).toEqual(["ok", "ok", "capacity_conflict"]);
    let g = await groupRow();
    expect(g.status).toBe("partially_confirmed");
    expect(g.totals).toMatchObject({ children: 3, confirmed_amount: 5800, pending_amount: 1500, failed_amount: 0 });
    // Each child is its own booking: the venue and A have jobs; B has none and the band's direct gig is untouched.
    const jobs = (await db.from("provider_jobs").select("build_item_id,workspace_id").in("build_item_id", [iV, iA, iB])).data ?? [];
    expect(jobs.map(j => j.build_item_id).sort()).toEqual([iV, iA].sort());
    // B's provider declines → the order is partially failed, confirmed children unaffected.
    await db.from("build_items").update({ status: "declined" }).eq("id", iB);
    g = await groupRow();
    expect(g.status).toBe("partially_failed");
    expect(g.totals).toMatchObject({ confirmed_amount: 5800, pending_amount: 0, failed_amount: 1500, needs_replacement: [{ build_item_id: iB, status: "declined" }] });
    expect((await db.from("build_items").select("status").in("id", [iV, iA])).data?.map(x => x.status)).toEqual(["confirmed", "confirmed"]);
    const { count: told } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", org.id).eq("title", "Part of your booking needs attention");
    expect(told).toBe(1);
    // A confirmed child cannot be dropped by editing the parent.
    expect((await orgC.rpc("order_group_set_item", { p_group: group, p_item: iA, p_action: "remove" })).error?.message).toMatch(/cancel_booking_first/);
    // Recovery: add supplier C, confirm it, drop the failed child.
    iC = await item(djC, "band", 1400);
    expect((await orgC.rpc("order_group_set_item", { p_group: group, p_item: iC, p_action: "add", p_depends_on: iV })).error).toBeNull();
    expect((await groupRow()).status).toBe("partially_failed");
    expect((await confirm(iC)).error).toBeNull();
    expect((await orgC.rpc("order_group_set_item", { p_group: group, p_item: iB, p_action: "remove" })).data).toBe("confirmed");
    g = await groupRow();
    expect(g.totals).toMatchObject({ children: 3, confirmed_amount: 7200, failed_amount: 0, pending_amount: 0 });
    expect(g.version).toBeGreaterThan(3);
  });

  test("canonical bookings view: the buyer sees its bookings with one status vocabulary; others see nothing", async () => {
    const mine = (await orgC.from("bookings").select("build_item_id,status,buyer_status,order_group_id").eq("event_id", event)).data ?? [];
    const byId = Object.fromEntries(mine.map(b => [b.build_item_id, b]));
    expect(byId[iV]).toMatchObject({ status: "confirmed", order_group_id: group });
    expect(byId[iB]).toMatchObject({ status: "declined", buyer_status: "declined", order_group_id: null });
    expect((await strangerC.from("bookings").select("booking_id").eq("event_id", event)).data).toHaveLength(0);
    // The supplier sees its marketplace booking (with its job) and its direct gig, not the other sellers'.
    const b = (await bC.from("bookings").select("source,status,provider_status,seller_workspace_id").eq("seller_workspace_id", B)).data ?? [];
    expect(b.map(x => x.source).sort()).toEqual(["direct", "marketplace"]);
    expect((await aC.from("bookings").select("booking_id").eq("seller_workspace_id", B)).data).toHaveLength(0);
  });
});
