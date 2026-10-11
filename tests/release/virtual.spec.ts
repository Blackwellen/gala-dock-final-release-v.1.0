import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, login, seedWorkspace, signedIn } from "../phase1/helpers";

// Release spec §122–127: ticket-gated virtual access; host links private; access follows the ticket.
const db = admin as unknown as SupabaseClient;

test.describe("virtual events", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, other: { id: string; email: string }, ws: string, ev: string, tier: string, ticket: string;
  test.beforeAll(async () => {
    [owner, buyer, other] = await Promise.all([createUser("vx-o"), createUser("vx-b"), createUser("vx-x")]);
    ws = await seedWorkspace(owner.id, "organizer", "Virtual Org");
    ev = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Online Summit", event_type: "remote_conference", status: "on_sale",
      starts_at: new Date(Date.now() + 10 * 60_000).toISOString(), ends_at: new Date(Date.now() + 70 * 60_000).toISOString() }).select("id").single()).data as { id: string }).id;
    tier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "Online", price: 10, quantity: 100, status: "on_sale" }).select("id").single()).data as { id: string }).id;
    ticket = ((await db.from("tickets").insert({ code: `VX${Date.now()}`, event_id: ev, tier_id: tier, holder_id: buyer.id, order_ref: `VXO${Date.now()}`, status: "valid" }).select("id").single()).data as { id: string }).id;
  });
  test.afterAll(async () => {
    await db.from("check_ins").delete().eq("event_id", ev); await db.from("tickets").delete().eq("event_id", ev); await db.from("ticket_tiers").delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev); await db.from("workspaces").delete().eq("id", ws); await cleanup();
  });

  test("only the current valid holder joins, inside the window; host links stay private", async () => {
    const o = await signedIn(owner.email) as unknown as SupabaseClient, b = await signedIn(buyer.email) as unknown as SupabaseClient, x = await signedIn(other.email) as unknown as SupabaseClient;
    expect((await o.rpc("save_event_virtual", { p_event: ev, p: { provider: "manual", format: "remote_conference", join_url: "https://meet.example.com/attendee", host_url: "https://meet.example.com/host", host_notes: "passcode 1234", opens_minutes_before: 5 } })).error).toBeNull();
    // Not open yet (starts in 10 min, opens 5 min before).
    expect((await b.rpc("virtual_join", { p_ticket: ticket })).data.reason).toBe("not_open_yet");
    await db.from("event_virtual").update({ opens_minutes_before: 30 }).eq("event_id", ev);
    const ok = (await b.rpc("virtual_join", { p_ticket: ticket })).data;
    expect(ok).toMatchObject({ ok: true, url: "https://meet.example.com/attendee", mode: "live" });
    expect((await db.from("check_ins").select("credential").eq("ticket_id", ticket)).data![0]!.credential).toBe("virtual");
    // Someone else can't use the ticket; attendees can't read host links; public summary has no URLs.
    expect((await x.rpc("virtual_join", { p_ticket: ticket })).data.reason).toBe("not_your_ticket");
    expect((await b.from("event_virtual").select("host_url").eq("event_id", ev)).data).toEqual([]);
    expect(JSON.stringify((await (anon() as unknown as SupabaseClient).rpc("event_virtual_public", { p_event: ev })).data)).not.toContain("https://");
    // A refunded ticket loses access.
    await db.from("tickets").update({ status: "refunded" }).eq("id", ticket);
    expect((await b.rpc("virtual_join", { p_ticket: ticket })).data.reason).toBe("refunded");
    await db.from("tickets").update({ status: "used" }).eq("id", ticket);
  });

  test("join route redirects the holder to the session", async ({ page }) => {
    await login(page, buyer.email, "/account");
    await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    const res = await page.request.get(`${BASE}/tickets/${ticket}/join`, { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("https://meet.example.com/attendee");
  });
});
