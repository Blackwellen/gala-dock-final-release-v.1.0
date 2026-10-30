import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, cleanup, createUser, seedWorkspace, insertEventFixture, login as signIn } from "../../phase1/helpers";

// W03 (organizer): model & capacity → tiers → seating → access → activate, plus the "release after sell-out" trigger.
// Runs against a disposable organiser (p1-*@gala-dock.test, purgeable fixture workspace) whose seller is payment-ready through a
// test-mode connect_accounts row (acct_test_*) + payout_status active — the same fixture mechanism as the payments specs. The demo
// Alex Events workspace is never touched, and the product's readiness check is unchanged.
const name = `E2E Pro Tickets ${Date.now()}`;
const db = adminClient as unknown as SupabaseClient;
const admin = () => db;
let eventId = "", ws = "", owner: { id: string; email: string };
const login = async (page: Parameters<typeof signIn>[0], _who: "organizer", next: string) => {
  await signIn(page, owner.email, next);
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 60_000 });
};
test.beforeAll(async () => {
  owner = await createUser("ticket-pro", "Ticket Pro Organiser");
  ws = await seedWorkspace(owner.id, "organizer", "p1 Ticket Pro Events");
  expect((await db.from("workspaces").update({ payout_status: "active" }).eq("id", ws)).error).toBeNull();
  expect((await db.from("connect_accounts").insert({ workspace_id: ws, stripe_account_id: `acct_test_tp${randomBytes(4).toString("hex")}`, account_type: "standard", charges_enabled: true,
    payouts_enabled: true, details_submitted: true, card_payments_capability: "active", transfers_capability: "active", verification_state: "verified" })).error).toBeNull();
  const { data: e, error } = await insertEventFixture({ workspace_id: ws, owner_id: owner.id, name, management: "professional", status: "planning", visibility: "public", event_type: "festival",
    starts_at: new Date(Date.now() + 60 * 864e5).toISOString(), ends_at: new Date(Date.now() + 60 * 864e5 + 8 * 36e5).toISOString(),
    description: "An outdoor electronic music festival with food, drinks and three stages.", venue_name: "Test Park", location: "London, UK", guest_count: 1000, capacity: 1000,
    settings: { venue_confirmed: true } }, "ticket-pro").select("id").single();
  expect(error).toBeNull();
  eventId = (e as { id: string }).id;
  // The lifecycle preconditions a real organiser completes before going on sale (event_lifecycle_blockers): confirmed venue and
  // capacity (above), a programme item, and an approved event safety plan (Q26 rule for 500+ people).
  expect((await db.from("programme_items").insert({ event_id: eventId, title: "Headliner", kind: "programme", starts_at: new Date(Date.now() + 60 * 864e5 + 2 * 36e5).toISOString() })).error).toBeNull();
  expect((await db.from("safety_plans").insert({ event_id: eventId, workspace_id: ws, kind: "event_safety", version: 1, status: "approved", title: "Event safety plan", sections: [], medical_provider: "St John", decision_note: "", approved_at: new Date().toISOString() })).error).toBeNull();
});
test.afterAll(async () => {
  if (eventId) {
    for (const t of ["discount_codes", "programme_items", "safety_plans"]) await db.from(t).delete().eq("event_id", eventId); await db.from("ticket_tiers").update({ after_tier: null }).eq("event_id", eventId);
    await db.from("ticket_tiers").delete().eq("event_id", eventId); await db.from("events").delete().eq("id", eventId);
  }
  if (ws) { await db.from("connect_accounts").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); }
  await cleanup();
});

test("set up and activate professional ticketing", async ({ page }) => {
  test.setTimeout(180_000);
  const base = `/organizer/events/${eventId}/tickets/setup`;
  await login(page, "organizer", `${base}?step=1`);
  await page.goto(`${base}?step=1`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Hybrid/ }).click();
  await page.getByLabel("Event capacity").fill("1000");
  await page.getByRole("button", { name: "Use suggestion" }).click();
  await expect(page.locator(".tp-secs tbody tr")).toHaveCount(6);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=2/);

  await page.getByRole("button", { name: "Use template" }).click();
  await expect(page.locator(".tp-tt tbody tr")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Create release plan" }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=3/, { timeout: 30_000 });

  // D01: five designed steps; a reload mid-flow keeps what earlier steps saved.
  await expect(page.locator(".tp-steps li")).toHaveCount(5);
  await page.reload({ waitUntil: "networkidle" });
  await page.goto(`${base}?step=1`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("Event capacity")).toHaveValue("1000");
  await page.goto(`${base}?step=3`, { waitUntil: "networkidle" });
  // Links from the earlier three-stage layout redirect to the matching step.
  await page.goto(`${base}?step=3&section=policies`, { waitUntil: "networkidle" }); await expect(page).toHaveURL(/step=4/);
  await page.goto(`${base}?step=3`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Auto-assign tiers to sections" }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=4/, { timeout: 30_000 });
  await page.getByRole("radio", { name: /Flexible refunds/ }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=5/, { timeout: 30_000 });

  await expect(page.getByText("Everything looks good!")).toBeVisible();
  await page.getByLabel(/I agree to the Gala Dock/).check();
  await page.getByRole("button", { name: /Publish tickets/ }).click();
  await page.waitForURL(/tab=sell/, { timeout: 30_000 });

  const db = admin();
  const { data: e } = await db.from("events").select("status,slug,settings").eq("id", eventId).single();
  const s = e!.settings as { ticket_pro: { model: string; capacity: number; sections: { tiers: string[] }[]; access: { refund: string }; phases: unknown[] }; ticketing_live: boolean };
  expect(e!.status).toBe("on_sale"); expect(e!.slug).toBeTruthy(); expect(s.ticketing_live).toBe(true);
  expect(s.ticket_pro).toMatchObject({ model: "hybrid", capacity: 1000 }); expect(s.ticket_pro.access.refund).toBe("flexible"); expect(s.ticket_pro.phases).toHaveLength(3);
  expect(s.ticket_pro.sections.some(x => x.tiers.length > 0)).toBe(true);
  const { data: tiers } = await db.from("ticket_tiers").select("id,name,status,quantity,release_name,allocation").eq("event_id", eventId).order("sort");
  expect(tiers!.length).toBeGreaterThan(2);
  expect(tiers!.reduce((a, t) => a + t.quantity, 0)).toBeLessThanOrEqual(950);
  expect(tiers!.every(t => ["on_sale", "scheduled"].includes(t.status))).toBe(true);
  expect(tiers!.some(t => t.allocation)).toBe(true);

  // Release-after rule: when the first tier sells out, a tier scheduled "after" it opens automatically.
  const [a, b] = tiers!;
  await db.from("ticket_tiers").update({ status: "on_sale" }).eq("id", a!.id);
  await db.from("ticket_tiers").update({ status: "scheduled", after_tier: a!.id }).eq("id", b!.id);
  await db.from("ticket_tiers").update({ sold: a!.quantity }).eq("id", a!.id);
  const { data: after } = await db.from("ticket_tiers").select("id,status").in("id", [a!.id, b!.id]);
  expect(after!.find(t => t.id === a!.id)!.status).toBe("sold_out");
  expect(after!.find(t => t.id === b!.id)!.status).toBe("on_sale");
  await db.from("ticket_tiers").update({ sold: 0 }).eq("id", a!.id);
});

test("validation blocks tiers above sellable capacity", async ({ page }) => {
  await login(page, "organizer", `/organizer/events/${eventId}/tickets/setup?step=2`);
  await page.goto(`/organizer/events/${eventId}/tickets/setup?step=2`, { waitUntil: "networkidle" });
  const qty = page.getByLabel(/ quantity$/).first();
  // Independent of the setup test: a fresh worker gets a fresh event with no tiers yet, so add one tier first (no sections are needed for that).
  if (!(await qty.isVisible().catch(() => false))) { await page.getByRole("button", { name: "Add tier" }).first().click(); await expect(qty).toBeVisible(); }
  await qty.fill("99999");
  await expect(page.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  await expect(page.locator(".tp-tot.bad")).toBeVisible();
});
