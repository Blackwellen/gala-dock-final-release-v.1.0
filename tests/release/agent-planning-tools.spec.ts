import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Gala Agent planning tools: venues.rank, event.break_even, seating.suggest — run as the human, scoped to their workspace.
const db = admin as unknown as SupabaseClient;

test.describe("agent planning tools", () => {
  let a: { id: string; email: string }, b: { id: string; email: string }, p: { id: string }, wsA: string, wsB: string, wsP: string, ev: string;
  const listings: string[] = [];
  test.beforeAll(async () => {
    [a, b, p] = await Promise.all([createUser("apt-a"), createUser("apt-b"), createUser("apt-p")]);
    [wsA, wsB, wsP] = await Promise.all([seedWorkspace(a.id, "organizer", "Plan A"), seedWorkspace(b.id, "organizer", "Plan B"), seedWorkspace(p.id, "provider", "Plan Venues")]);
    ev = ((await db.from("events").insert({ owner_id: a.id, workspace_id: wsA, name: "Planning Gala", city: "Zedtown", guest_count: 120, budget_total: 20000 }).select("id").single()).data as { id: string }).id;
    const ins = await db.from("listings").insert([
      { workspace_id: wsP, name: "APT Right Size Hall", kind: "venue", category: "venue", city: "Zedtown", published: true, capacity_min: 50, capacity_max: 180, price_from: 5000, rating: 4.8, review_count: 12, response_hours: 2 },
      { workspace_id: wsP, name: "APT Tiny Room", kind: "venue", category: "venue", city: "Zedtown", published: true, capacity_min: 5, capacity_max: 40, price_from: 900, rating: 4.9, review_count: 30, response_hours: 1 },
    ]).select("id");
    expect(ins.error).toBeNull();
    listings.push(...(ins.data as { id: string }[]).map(x => x.id));
    // Costs: one confirmed supplier (£6,000) and one quoted (£2,000). Tickets: 100 × £50 + 50 × £150 → average £83.33.
    const seeds = await Promise.all([db.from("build_items").insert([
      { event_id: ev, category: "catering", title: "Catering", amount: 6000, status: "confirmed", role: "primary" },
      { event_id: ev, category: "av", title: "AV", amount: 2000, status: "quoted", role: "primary" },
    ]), db.from("ticket_tiers").insert([
      { event_id: ev, name: "Standard", price: 50, quantity: 100, sold: 30, status: "on_sale" },
      { event_id: ev, name: "VIP", price: 150, quantity: 50, sold: 10, status: "on_sale" },
    ]), db.from("guests").insert([
      ...["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"].map(n => ({ event_id: ev, name: `${n} Smith`, status: "confirmed", group_name: "Smith family", plus_one: false, dietary: "" })),
      ...["Gus", "Hal", "Ivy"].map(n => ({ event_id: ev, name: `${n} Jones`, status: "confirmed", group_name: "Jones", plus_one: n === "Gus", dietary: "" })),
      { event_id: ev, name: "Solo Guest", status: "pending", group_name: "", plus_one: false, dietary: "" },
      { event_id: ev, name: "Declined Guest", status: "declined", group_name: "", plus_one: false, dietary: "" },
    ])]);
    for (const s of seeds) expect(s.error).toBeNull();
    // Dietary needs live in guest_care (Q18; legacy guests.dietary is scrubbed by 4021) — owners/managers only, never in prompts.
    const hal = ((await db.from("guests").select("id").eq("event_id", ev).eq("name", "Hal Jones").single()).data as { id: string }).id;
    expect((await db.from("guest_care").upsert({ guest_id: hal, event_id: ev, dietary: "Vegan" })).error).toBeNull();
  });
  test.afterAll(async () => {
    await db.from("guest_care").delete().eq("event_id", ev);
    await db.from("guests").delete().eq("event_id", ev);
    await db.from("ticket_tiers").delete().eq("event_id", ev);
    await db.from("build_items").delete().eq("event_id", ev);
    await db.from("listings").delete().in("id", listings);
    await db.from("events").delete().eq("id", ev);
    await db.from("workspaces").delete().in("id", [wsA, wsB, wsP]);
    await cleanup();
  });

  const run = (actor: string, ws: string, tool: string, args: object) => db.rpc("agent_invoke", { p_actor: actor, p_workspace: ws, p_tool: tool, p_args: args });

  test("venues.rank scores fit, city and budget with reasons", async () => {
    const r = await run(a.id, wsA, "venues.rank", { event_id: ev, limit: 20 });
    expect(r.error).toBeNull();
    const venues = (r.data as { venues: { listing_id: string; score: number; reasons: Record<string, string> }[] }).venues;
    const right = venues.find(v => v.listing_id === listings[0])!, tiny = venues.find(v => v.listing_id === listings[1])!;
    expect(right.score).toBeGreaterThan(tiny.score);
    expect(right.reasons.capacity).toMatch(/Good fit for 120/);
    expect(tiny.reasons.capacity).toMatch(/Too small/);
    expect(right.reasons.city).toBe("In Zedtown");
    expect(right.reasons.price).toMatch(/25% of budget/);
  });

  test("event.break_even counts supplier costs against average ticket price", async () => {
    const r = await run(a.id, wsA, "event.break_even", { event_id: ev, extra_costs: 1000 });
    expect(r.error).toBeNull();
    const o = r.data as { costs: { committed: number; pending: number; total: number }; break_even_tickets: number; remaining_to_break_even: number; achievable: boolean };
    expect(o.costs).toMatchObject({ committed: 6000, pending: 2000, total: 9000 });
    expect(o.break_even_tickets).toBe(108);       // ceil(9000 / 83.33)
    expect(o.remaining_to_break_even).toBe(68);   // 40 sold
    expect(o.achievable).toBe(true);
    // A platform fee raises the number of tickets needed.
    const f = (await run(a.id, wsA, "event.break_even", { event_id: ev, extra_costs: 1000, fee_pct: 10 })).data as { break_even_tickets: number };
    expect(f.break_even_tickets).toBe(120);       // ceil(9000 / 75)
  });

  test("seating.suggest keeps groups together and counts plus-ones", async () => {
    const r = await run(a.id, wsA, "seating.suggest", { event_id: ev, table_size: 8 });
    expect(r.error).toBeNull();
    const o = r.data as { seats_needed: number; tables_needed: number; tables: { seats_used: number; groups: string[]; guests: { name: string }[]; dietary: string[] }[] };
    expect(o.seats_needed).toBe(11);             // 6 Smiths + 3 Jones + Gus's plus-one + 1 pending; declined excluded
    expect(o.tables_needed).toBe(2);
    const smith = o.tables.find(t => t.groups.includes("Smith family"))!;
    expect(smith.guests.filter(g => g.name.endsWith("Smith"))).toHaveLength(6);
    const jones = o.tables.find(t => t.groups.includes("Jones"))!;
    expect(jones.guests.filter(g => g.name.endsWith("Jones"))).toHaveLength(3);
    expect(jones.dietary).toContain("Vegan");   // read from guest_care (4032)
    expect(((await db.from("guests").select("dietary").eq("event_id", ev)).data ?? []).every(g => !g.dietary)).toBe(true);
    expect(o.tables.flatMap(t => t.guests).some(g => g.name === "Declined Guest")).toBe(false);
    const confirmedOnly = (await run(a.id, wsA, "seating.suggest", { event_id: ev, table_size: 8, include_pending: false })).data as { seats_needed: number };
    expect(confirmedOnly.seats_needed).toBe(10);
  });

  test("another workspace's agent can't use these tools on the event; RPCs are guarded", async () => {
    for (const tool of ["venues.rank", "event.break_even", "seating.suggest"]) expect((await run(b.id, wsB, tool, { event_id: ev })).error).not.toBeNull();
    const cb = await signedIn(b.email) as unknown as SupabaseClient;
    expect((await cb.rpc("event_break_even", { p_event: ev })).error).not.toBeNull();
    expect((await cb.rpc("suggest_seating", { p_event: ev })).error).not.toBeNull();
    expect((await cb.rpc("agent_invoke_ext", { p_workspace: wsA, p_tool: "seating.suggest", p_args: { event_id: ev } })).error).not.toBeNull();
  });
});
