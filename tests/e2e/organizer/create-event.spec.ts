import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// W01: basics → date & venue → commercial → setup → event created in planning with starter tasks and a draft tier.
const name = `E2E Fest ${Date.now()}`;
test.afterAll(async () => { const db = admin(); const { data } = await db.from("events").select("id").eq("name", name); for (const e of data ?? []) { await db.from("tasks").delete().eq("event_id", e.id); await db.from("ticket_tiers").delete().eq("event_id", e.id); await db.from("agent_runs").delete().eq("event_id", e.id); await db.from("events").delete().eq("id", e.id); } });

test("create a professional event end to end", async ({ page }) => {
  await login(page, "organizer", "/organizer/events/new?step=1");
  await page.goto("/organizer/events/new?step=1", { waitUntil: "networkidle" });
  await page.getByPlaceholder("e.g. Neon Nights Festival").fill(name);
  await page.getByRole("radio", { name: "Festival" }).click();
  await page.getByPlaceholder(/Describe the purpose/).fill("A two-day outdoor festival with 2,000 guests and food stalls.");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=2/);
  await page.locator(".ce2-vl li").first().getByRole("button", { name: /Select venue/ }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=3/);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=4/);
  await page.getByRole("button", { name: /Create event/ }).click();
  await page.waitForURL(/\/organizer\/events\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const db = admin();
  const { data: e } = await db.from("events").select("id,status,management,venue_listing_id,budget_total,settings").eq("name", name).single();
  expect(e).toMatchObject({ status: "planning", management: "professional" });
  expect(e!.venue_listing_id).toBeTruthy(); expect(Number(e!.budget_total)).toBeGreaterThan(0);
  const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", e!.id);
  expect(count).toBeGreaterThan(5);
  const { count: tiers } = await db.from("ticket_tiers").select("id", { count: "exact", head: true }).eq("event_id", e!.id);
  expect(tiers).toBe(1);
});
