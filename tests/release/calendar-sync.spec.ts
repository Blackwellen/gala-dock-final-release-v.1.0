import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, signedIn, BASE } from "../phase1/helpers";

// Two-way calendar sync contract: tokens are never readable by clients, busy blocks are owner-only, status/disconnect go
// through narrow RPCs, the workers are authenticated, and OAuth falls back cleanly when a provider isn't configured.
const db = admin as unknown as SupabaseClient;

test.describe("calendar sync", () => {
  let u: { id: string; email: string }, other: { id: string; email: string }, conn: string;
  test.beforeAll(async () => {
    u = await createUser("calsync"); other = await createUser("calsync-x");
    conn = ((await db.from("calendar_connections").insert({ user_id: u.id, provider: "google", account_email: "u@example.com", token_enc: "v1.x.y.z" }).select("id").single()).data as { id: string }).id;
    await db.from("calendar_busy_blocks").insert({ connection_id: conn, user_id: u.id, starts_at: new Date(Date.now() + 864e5).toISOString(), ends_at: new Date(Date.now() + 864e5 + 36e5).toISOString() });
  });
  test.afterAll(async () => { await db.from("calendar_connections").delete().in("user_id", [u.id, other.id]); await cleanup(); });

  test("tokens are hidden; status and busy blocks are owner-only", async () => {
    const c = await signedIn(u.email) as unknown as SupabaseClient;
    expect((await c.from("calendar_connections").select("token_enc")).error).not.toBeNull();
    expect((await (anon() as unknown as SupabaseClient).from("calendar_connections").select("id")).error).not.toBeNull();
    const mine = (await c.rpc("my_calendar_connections")).data as { provider: string; account_email: string; status: string }[];
    expect(mine).toEqual([expect.objectContaining({ provider: "google", account_email: "u@example.com", status: "active" })]);
    expect(Object.keys(mine[0]!)).not.toContain("token_enc");
    expect(((await c.from("calendar_busy_blocks").select("id")).data ?? []).length).toBe(1);
    const x = await signedIn(other.email) as unknown as SupabaseClient;
    expect(((await x.from("calendar_busy_blocks").select("id")).data ?? []).length).toBe(0);
    expect((await x.rpc("my_calendar_connections")).data).toEqual([]);
    expect((await (anon() as unknown as SupabaseClient).rpc("calendar_feed_for_user", { p_user: u.id })).error).not.toBeNull();
    expect((await c.rpc("calendar_feed_for_user", { p_user: u.id })).error).not.toBeNull();
  });

  test("another user can't disconnect it; the owner can, and busy blocks go with it", async () => {
    const x = await signedIn(other.email) as unknown as SupabaseClient;
    await x.rpc("disconnect_my_calendar", { p_provider: "google" });
    expect((await db.from("calendar_connections").select("id").eq("id", conn)).data!.length).toBe(1);
    const c = await signedIn(u.email) as unknown as SupabaseClient;
    expect((await c.rpc("disconnect_my_calendar", { p_provider: "google" })).error).toBeNull();
    expect((await db.from("calendar_connections").select("id").eq("id", conn)).data!.length).toBe(0);
    expect((await db.from("calendar_busy_blocks").select("id").eq("connection_id", conn)).data!.length).toBe(0);
  });

  test("workers require auth; unconfigured providers fall back to the ICS link", async ({ request }) => {
    expect((await request.post(`${BASE}/api/cron/calendar-sync`)).status()).toBe(401);
    expect((await request.post(`${BASE}/api/calendar/sync`)).status()).toBe(401);
    const r = await request.get(`${BASE}/api/calendar/oauth/yahoo/start?return=/organizer/calendar`, { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toMatch(/\/organizer\/calendar\?calendar=unavailable$/);
    const evil = await request.get(`${BASE}/api/calendar/oauth/yahoo/start?return=${encodeURIComponent("//evil.example")}`, { maxRedirects: 0 });
    expect(new URL(evil.headers()["location"]!).pathname).toBe("/account");
    // Callback without a matching state cookie is rejected.
    const cb = await request.get(`${BASE}/api/calendar/oauth/google/callback?code=x&state=y`, { maxRedirects: 0 });
    expect(cb.headers()["location"]).toMatch(/calendar=error/);
  });
});
