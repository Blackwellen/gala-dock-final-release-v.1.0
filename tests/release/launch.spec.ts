import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, seedWorkspace } from "../phase1/helpers";

// Release spec §50–52: derived launch states; server-authoritative waiting room (no fake positions).
const db = admin as unknown as SupabaseClient;
const h = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("launch states and waiting room", () => {
  let owner: { id: string }, ws: string;
  const ids: string[] = [];
  test.beforeAll(async () => { owner = await createUser("ln-o"); ws = await seedWorkspace(owner.id, "organizer", "Launch Org"); });
  test.afterAll(async () => { await db.from("ticket_tiers").delete().in("event_id", ids); await db.from("events").delete().in("id", ids); await db.from("workspaces").delete().eq("id", ws); await cleanup(); });
  const ev = async (status: string, settings: object, tier?: { quantity: number; sold: number; name?: string }) => {
    const id = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: `Launch ${status}`, status, settings, starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    ids.push(id);
    if (tier) await db.from("ticket_tiers").insert({ event_id: id, name: tier.name ?? "GA", price: 20, quantity: tier.quantity, sold: tier.sold, status: "on_sale" });
    return id;
  };
  const state = async (id: string) => (await (anon() as unknown as SupabaseClient).rpc("event_launch_state", { p_event: id })).data;

  test("states derive from status, launch time and inventory", async () => {
    expect(await state(await ev("planning", {}))).toBe("draft");
    expect(await state(await ev("published", { launch: { at: new Date(Date.now() + 3 * 864e5).toISOString() } }))).toBe("countdown");
    expect(await state(await ev("published", { launch: { at: new Date(Date.now() + 30 * 864e5).toISOString() } }))).toBe("coming_soon");
    expect(await state(await ev("on_sale", {}, { quantity: 100, sold: 10 }))).toBe("on_sale");
    expect(await state(await ev("on_sale", {}, { quantity: 100, sold: 95 }))).toBe("low_availability");
    expect(await state(await ev("on_sale", {}, { quantity: 100, sold: 100 }))).toBe("sold_out");
    expect(await state(await ev("on_sale", {}, { quantity: 100, sold: 20, name: "Final release" }))).toBe("final_release");
    expect(await state(await ev("postponed", {}))).toBe("postponed");
  });

  test("waiting room admits in join order at the configured rate", async ({ request }) => {
    const id = await ev("on_sale", { launch: { at: new Date(Date.now() - 30_000).toISOString(), waiting_room: { enabled: true, rate_per_minute: 1, admit_minutes: 10 } } }, { quantity: 50, sold: 0 });
    const a = anon() as unknown as SupabaseClient;
    const r: { admitted: boolean; ahead: number }[] = [];
    for (const t of ["one", "two", "three", "four"]) r.push((await a.rpc("queue_join", { p_event: id, p_token_hash: h(t + id) })).data);
    // Rate 1/minute: the opening burst admits one; everyone else sees a real, server-computed place in line.
    expect(r[0]!.admitted).toBe(true);
    expect(r[1]!.admitted).toBe(false); expect(r[1]!.ahead).toBe(0);
    expect(r[3]!.admitted).toBe(false); expect(r[3]!.ahead).toBe(2);
    // Re-joining keeps your place; checkout gate agrees with the status.
    expect((await a.rpc("queue_join", { p_event: id, p_token_hash: h("four" + id) })).data.ahead).toBe(r[3]!.ahead);
    expect((await db.rpc("queue_admit_check", { p_event: id, p_token_hash: h("one" + id) })).data).toBe(true);
    expect((await db.rpc("queue_admit_check", { p_event: id, p_token_hash: h("four" + id) })).data).toBe(false);
    // HTTP: joining sets an httpOnly token cookie and returns a server-computed position.
    const res = await request.post(`${BASE}/api/events/${id}/queue`);
    expect(res.ok()).toBe(true);
    expect(res.headers()["set-cookie"]).toMatch(/gd_q_.*HttpOnly/i);
    expect((await res.json()).joined).toBe(true);
    // Events without a waiting room don't queue anyone.
    const open = await ev("on_sale", {}, { quantity: 10, sold: 0 });
    expect((await a.rpc("queue_join", { p_event: open, p_token_hash: h("x") })).data.required).toBe(false);
  });
});
