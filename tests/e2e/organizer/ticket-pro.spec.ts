import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// W03 (organizer): model & capacity → tiers → seating → access → activate, plus the "release after sell-out" trigger.
const name = `E2E Pro Tickets ${Date.now()}`;
let eventId = "";
test.beforeAll(async () => {
  const db = admin();
  const { data: ws } = await db.from("workspaces").select("id,owner_id").eq("name", "Alex Events").single();
  const { data: e } = await db.from("events").insert({ workspace_id: ws!.id, owner_id: ws!.owner_id, name, management: "professional", status: "planning", visibility: "public", event_type: "festival", starts_at: new Date(Date.now() + 60 * 864e5).toISOString(), ends_at: new Date(Date.now() + 60 * 864e5 + 8 * 36e5).toISOString(), description: "An outdoor electronic music festival with food, drinks and three stages.", venue_name: "Test Park", location: "London, UK", guest_count: 1000 }).select("id").single();
  eventId = e!.id;
});
test.afterAll(async () => { const db = admin(); await db.from("discount_codes").delete().eq("event_id", eventId); await db.from("ticket_tiers").update({ after_tier: null }).eq("event_id", eventId); await db.from("ticket_tiers").delete().eq("event_id", eventId); await db.from("events").delete().eq("id", eventId); });

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
  await qty.fill("99999");
  await expect(page.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  await expect(page.locator(".tp-tot.bad")).toBeVisible();
});
