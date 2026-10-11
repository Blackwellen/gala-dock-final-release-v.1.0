import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// CU-W01: occasion → date/location/guests → budget/priorities → recommended build → create event with suggestions.
const title = `E2E Plan ${Date.now()}`;
test.afterAll(async () => { const db = admin(); const { data } = await db.from("events").select("id").eq("name", title); for (const e of data ?? []) { await db.from("tasks").delete().eq("event_id", e.id); await db.from("build_items").delete().eq("event_id", e.id); await db.from("events").delete().eq("id", e.id); } });

test("plan an event end to end", async ({ page }) => {
  await login(page, "customer", "/plan");
  await page.goto("/plan", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Continue to Date/ })).toBeDisabled();
  await page.getByRole("radio", { name: "Wedding" }).click();
  await page.locator("#pw-name").fill(title);
  await page.getByRole("button", { name: /Continue to Date/ }).click();
  await page.waitForURL(/step=2/);
  const { data: draft } = await admin().from("events").select("id,status,event_type,visibility").eq("name", title).single();
  expect(draft).toMatchObject({ status: "draft", event_type: "wedding", visibility: "private" });
  await page.getByRole("button", { name: "Next month" }).click(); await page.getByRole("button", { name: "Next month" }).click();
  await page.locator(".pw-day:not(.out):not(:disabled)").nth(10).click();
  await page.getByRole("button", { name: /Continue to Budget/ }).click();
  await page.waitForURL(/step=3/);
  const { data: e2 } = await admin().from("events").select("starts_at,guest_count,city").eq("id", draft!.id).single();
  expect(e2!.starts_at).toBeTruthy(); expect(e2!.guest_count).toBe(100);
  await page.getByRole("button", { name: /Continue to Recommended/ }).click();
  await page.waitForURL(/step=4/);
  await expect(page.getByRole("heading", { name: "Recommended category plan" })).toBeVisible();
  await page.getByRole("button", { name: /Create Event & Continue to Build/ }).click();
  await page.waitForURL(new RegExp(`/account/events/${draft!.id}/build`), { timeout: 60_000 });
  const db = admin();
  const { data: ev } = await db.from("events").select("status,priorities,budget_total").eq("id", draft!.id).single();
  expect(ev!.status).toBe("planning"); expect(ev!.priorities!.length).toBeGreaterThanOrEqual(3); expect(Number(ev!.budget_total)).toBeGreaterThan(0);
  const { data: items } = await db.from("build_items").select("status,category").eq("event_id", draft!.id);
  expect(items!.length).toBeGreaterThan(0); expect(items!.every(i => i.status === "suggested")).toBe(true);
  const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", draft!.id);
  expect(count).toBeGreaterThan(3);
});
