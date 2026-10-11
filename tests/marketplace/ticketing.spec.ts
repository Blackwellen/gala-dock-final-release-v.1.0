import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, login, signedIn } from "../phase1/helpers";

// Phase 7 ticketing (§46–51 + user additions): detailed scan outcomes, re-entry, session validity, rotating signed credentials
// verified end-to-end through the scanner, two-step transfer invalidating old credentials, waiting lists, PDF tickets, oversell safety.
const db = admin as unknown as SupabaseClient;
type Scan = { result: string; attendee: string | null };

test.describe.configure({ mode: "serial" });
test.describe("ticketing", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, friend: { id: string; email: string }, out: { id: string; email: string };
  let ownC: SupabaseClient, buyC: SupabaseClient, friendC: SupabaseClient, outC: SupabaseClient;
  let event: string, other: string, tier: string, ticket: string;
  const code = `GLD-T${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;

  test.beforeAll(async () => {
    [owner, buyer, friend, out] = await Promise.all([createUser("tk-own"), createUser("tk-buy"), createUser("tk-friend"), createUser("tk-out")]);
    event = ((await db.from("events").insert({ owner_id: owner.id, name: "Ticket test", visibility: "public", status: "on_sale", starts_at: new Date(Date.now() + 864e5).toISOString(), settings: { reentry: false } }).select("id").single()).data as { id: string }).id;
    other = ((await db.from("events").insert({ owner_id: owner.id, name: "Other event", starts_at: new Date(Date.now() + 2 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    tier = ((await db.from("ticket_tiers").insert({ event_id: event, name: "GA", price: 20, quantity: 5, status: "on_sale", order_limit: 10 }).select("id").single()).data as { id: string }).id;
    ticket = ((await db.from("tickets").insert({ code, event_id: event, tier_id: tier, holder_id: buyer.id, attendee_name: "Buyer Person", attendee_email: buyer.email, order_ref: "GD-TEST", price_paid: 20 }).select("id").single()).data as { id: string }).id;
    [ownC, buyC, friendC, outC] = await Promise.all([signedIn(owner.email), signedIn(buyer.email), signedIn(friend.email), signedIn(out.email)]) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("id", [event, other]);
    await cleanup();
  });

  const nonceOf = async (id: string) => ((await db.from("tickets").select("qr_nonce").eq("id", id).single()).data as { qr_nonce: string }).qr_nonce;
  const scan = async (c: SupabaseClient, ev: string, args: Record<string, unknown>) => (await c.rpc("scan_ticket", { p_event: ev, p_ticket: null, p_code: null, p_nonce: null, p_credential: "manual", ...args }));

  test("scan outcomes: wrong event, admitted, duplicate vs re-entry, outsiders refused", async () => {
    expect((await scan(outC, event, { p_code: code })).error?.message).toMatch(/not_authorized/);
    expect(((await scan(ownC, other, { p_code: code })).data as Scan).result).toBe("wrong_event");
    expect(((await scan(ownC, event, { p_ticket: ticket, p_nonce: "not-the-nonce", p_credential: "wallet" })).data as Scan).result).toBe("invalid");
    expect(((await scan(ownC, event, { p_ticket: ticket, p_nonce: await nonceOf(ticket), p_credential: "wallet" })).data as Scan)).toMatchObject({ result: "admitted", attendee: "Buyer Person" });
    expect(((await scan(ownC, event, { p_code: code })).data as Scan).result).toBe("duplicate");
    await db.from("events").update({ settings: { reentry: true } }).eq("id", event);
    expect(((await scan(ownC, event, { p_code: code })).data as Scan).result).toBe("readmitted");
    await db.from("tickets").update({ status: "valid", checked_in_at: null }).eq("id", ticket);
  });

  test("session validity: a day ticket is refused outside its session", async () => {
    const t2 = ((await db.from("ticket_tiers").insert({ event_id: event, name: "Sunday only", price: 10, quantity: 5, status: "on_sale", order_limit: 10,
      valid_from: new Date(Date.now() + 5 * 864e5).toISOString(), valid_to: new Date(Date.now() + 6 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    const c2 = `GLD-S${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    await db.from("tickets").insert({ code: c2, event_id: event, tier_id: t2, holder_id: buyer.id, attendee_name: "Sunday Guest", order_ref: "GD-TEST2", price_paid: 10 });
    expect(((await scan(ownC, event, { p_code: c2 })).data as Scan).result).toBe("wrong_session");
  });

  test("offline manifest carries identities and statuses only — never nonces", async () => {
    const { data } = await ownC.rpc("scan_manifest", { p_event: event });
    const rows = data as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(rows[0]!)).not.toContain("qr_nonce");
    expect(JSON.stringify(rows)).not.toContain(await nonceOf(ticket));
    expect(((await outC.rpc("scan_manifest", { p_event: event })).data as unknown[]).length).toBe(0);
  });

  async function holderCredential(page: Page, email: string, id: string) {
    await login(page, email, `/account/tickets/${id}`);
    await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
    const r = await page.request.get(`${BASE}/api/tickets/${id}/credential`);
    return r.json() as Promise<{ status: string; payload?: string }>;
  }
  async function scanAsOwner(page: Page, payload: string) {
    await page.goto(`${BASE}/account/events/${event}/scan`);
    await page.getByLabel("Ticket code").fill(payload);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    return (await page.locator(".sc-result b").first().textContent({ timeout: 15000 }))?.trim();
  }

  test("rotating wallet credential is signed, scans end-to-end, and dies after a two-step transfer", async ({ browser }) => {
    const holder = await (await browser.newContext()).newPage();
    const c1 = await holderCredential(holder, buyer.email, ticket);
    expect(c1.status).toBe("valid");
    expect(c1.payload).toMatch(/^GD2\.[A-Za-z0-9_-]{22}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    expect(c1.payload).not.toContain(code);
    const forged = c1.payload!.replace(/.$/, c1.payload!.endsWith("A") ? "B" : "A");
    const staff = await (await browser.newContext()).newPage();
    await login(staff, owner.email, `/account/events/${event}/scan`);
    await staff.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
    expect(await scanAsOwner(staff, forged)).toBe("Invalid ticket");
    // Outsider cannot fetch someone else's credential.
    const nosy = await (await browser.newContext()).newPage();
    expect((await holderCredential(nosy, out.email, ticket) as { error?: string }).error).toBe("Not found");
    // Two-step transfer: offer → (still valid) → accept → old credential is "Transferred".
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const hash = (await import("node:crypto")).createHash("sha256").update(token).digest("hex");
    expect((await buyC.rpc("offer_ticket_transfer", { p_ticket: ticket, p_email: friend.email, p_name: "Friend", p_token_hash: hash })).error).toBeNull();
    expect((await outC.rpc("accept_ticket_transfer", { p_token_hash: hash })).error?.message).toMatch(/wrong_recipient/);
    expect(((await db.from("tickets").select("status").eq("id", ticket).single()).data as { status: string }).status).toBe("valid");
    const { data: newId, error } = await friendC.rpc("accept_ticket_transfer", { p_token_hash: hash });
    expect(error).toBeNull();
    expect(await scanAsOwner(staff, c1.payload!)).toBe("Transferred — old ticket");
    const c2 = await holderCredential(await (await browser.newContext()).newPage(), friend.email, newId as string);
    expect(await scanAsOwner(staff, c2.payload!)).toBe("Valid — admit");
  });

  test("printable PDF ticket: holder only, valid only, real PDF", async ({ browser }) => {
    const { data: t } = await db.from("tickets").select("id").eq("holder_id", friend.id).eq("event_id", event).single();
    const page = await (await browser.newContext()).newPage();
    await login(page, friend.email, `/account/tickets/${(t as { id: string }).id}`);
    await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
    // The friend's ticket was scanned in the previous test → used → printing refused; reset to valid to print.
    await db.from("tickets").update({ status: "valid", checked_in_at: null }).eq("id", (t as { id: string }).id);
    const r = await page.request.get(`${BASE}/api/tickets/${(t as { id: string }).id}/pdf`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toBe("application/pdf");
    expect((await r.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await page.request.get(`${BASE}/api/tickets/${ticket}/pdf`)).status()).toBe(404); // old, transferred ticket isn't theirs
  });

  test("waiting list: join, then notified when inventory frees", async () => {
    await db.from("ticket_tiers").update({ sold: 5 }).eq("id", tier);
    expect((await buyC.rpc("join_waitlist", { p_event: event, p_tier: tier, p_qty: 2 })).error).toBeNull();
    await db.from("ticket_tiers").update({ sold: 3 }).eq("id", tier);
    expect(Number((await db.rpc("notify_waitlists")).data)).toBeGreaterThanOrEqual(1);
    expect(((await db.from("ticket_tiers").select("status").eq("id", tier).single()).data as { status: string }).status).toBe("on_sale");
    expect(((await buyC.from("ticket_waitlist").select("status").eq("event_id", event).single()).data as { status: string }).status).toBe("notified");
  });

  test("§47 inventory safety: 15 concurrent holds never oversell 5 tickets", async () => {
    await db.from("ticket_tiers").update({ sold: 0, held: 0, quantity: 5 }).eq("id", tier);
    const a = anon() as unknown as SupabaseClient;
    const tries = await Promise.all(Array.from({ length: 15 }, () => a.rpc("hold_tickets", { p_event: event, p_items: [{ tier, qty: 1 }], p_token: randomUUID() + randomUUID() })));
    const won = tries.filter(t => !t.error).length;
    const { data: tr } = await db.from("ticket_tiers").select("sold,held,quantity").eq("id", tier).single();
    expect(won).toBe(5);
    expect((tr as { held: number }).held).toBe(5);
  });
});
