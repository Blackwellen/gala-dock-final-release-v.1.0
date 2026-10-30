import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// CU-W01 (D01, six steps): occasion → date & location → guests & size → services & extras → budget & priorities → recommended build.
// Every step saves before moving on; a reload mid-flow resumes with the saved values.
const title = `E2E Plan ${Date.now()}`;
test.afterAll(async () => { const db = admin(); const { data } = await db.from("events").select("id").eq("name", title); for (const e of data ?? []) { await db.from("tasks").delete().eq("event_id", e.id); await db.from("build_items").delete().eq("event_id", e.id); await db.from("events").delete().eq("id", e.id); } });

test("plan an event end to end", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, "customer", "/plan");
  await page.goto("/plan", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Continue to Date/ })).toBeDisabled();
  await page.getByRole("radio", { name: "Wedding" }).click();
  await page.locator("#pw-name").fill(title);
  await page.getByRole("button", { name: /Continue to Date/ }).click();
  await page.waitForURL(/step=2/);
  const { data: draft } = await admin().from("events").select("id,status,event_type,visibility").eq("name", title).single();
  expect(draft).toMatchObject({ status: "draft", event_type: "wedding", visibility: "private" });

  // Step 2: date is required.
  await expect(page.getByRole("button", { name: /Continue to Guests/ })).toBeDisabled();
  await page.getByRole("button", { name: "Next month" }).click(); await page.getByRole("button", { name: "Next month" }).click();
  await page.locator(".pw-day:not(.out):not(:disabled)").nth(10).click();
  await page.getByRole("button", { name: /Continue to Guests/ }).click();
  await page.waitForURL(/step=3/);
  const { data: e2 } = await admin().from("events").select("starts_at,settings").eq("id", draft!.id).single();
  expect(e2!.starts_at).toBeTruthy(); expect((e2!.settings as { plan_steps?: number }).plan_steps).toBe(2);

  // Step 3: guests; a breakdown that doesn't add up blocks Continue.
  await page.getByRole("textbox", { name: "Total guests", exact: true }).fill("80");
  await page.getByRole("textbox", { name: "Adults", exact: true }).fill("50");
  await expect(page.getByRole("button", { name: /Continue to Services/ })).toBeDisabled();
  await page.getByRole("button", { name: "Use that as the total" }).click();
  await page.getByRole("checkbox", { name: "Wheelchair accessible" }).check();
  await page.getByRole("button", { name: /Continue to Services/ }).click();
  await page.waitForURL(/step=4/);
  const { data: e3 } = await admin().from("events").select("guest_count,adults,settings").eq("id", draft!.id).single();
  expect(e3).toMatchObject({ guest_count: 50, adults: 50 }); expect((e3!.settings as { accessibility?: string[] }).accessibility).toEqual(["wheelchair"]);

  // Reload mid-flow: the wizard resumes on the furthest step with saved values (deep link without ?step).
  await page.goto(`/plan?event=${draft!.id}`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(new RegExp(`event=${draft!.id}`));
  await expect(page.getByText("Step 4 of 6")).toBeVisible();
  await page.goto(`/plan?event=${draft!.id}&step=3`, { waitUntil: "networkidle" });
  await expect(page.getByRole("textbox", { name: "Total guests", exact: true })).toHaveValue("50");
  // A deep link past the saved progress is clamped.
  await page.goto(`/plan?event=${draft!.id}&step=6`, { waitUntil: "networkidle" });
  await expect(page.getByText("Step 4 of 6")).toBeVisible();

  // Step 4: services must have at least one.
  await page.getByRole("button", { name: /Continue to Budget/ }).click();
  await page.waitForURL(/step=5/);
  const { data: e4 } = await admin().from("events").select("priorities").eq("id", draft!.id).single();
  expect(e4!.priorities!.length).toBeGreaterThanOrEqual(3);

  // Step 5: budget.
  await page.getByRole("radio", { name: /Get a suggestion/ }).click();
  await page.getByRole("button", { name: /Continue to Recommended/ }).click();
  await page.waitForURL(/step=6/);
  await expect(page.getByRole("heading", { name: "Recommended category plan" })).toBeVisible();
  await page.getByRole("button", { name: /Create Event & Continue to Build/ }).click();
  await page.waitForURL(new RegExp(`/account/events/${draft!.id}/build`), { timeout: 60_000 });
  const db = admin();
  const { data: ev } = await db.from("events").select("status,priorities,budget_total,settings").eq("id", draft!.id).single();
  expect(ev!.status).toBe("planning"); expect(ev!.priorities!.length).toBeGreaterThanOrEqual(3); expect(Number(ev!.budget_total)).toBeGreaterThan(0);
  expect((ev!.settings as { plan_steps?: number }).plan_steps).toBe(5);
  const { data: items } = await db.from("build_items").select("status,category").eq("event_id", draft!.id);
  expect(items!.length).toBeGreaterThan(0); expect(items!.every(i => i.status === "suggested")).toBe(true);
  const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", draft!.id);
  expect(count).toBeGreaterThan(3);
});
