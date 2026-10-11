import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// CU-006 guests, CU-008 messages, CU-011 saved: the everyday customer writes go through the UI and land in the database.
let ev = ""; let cust = ""; const guest = `E2E Guest ${Date.now()}`; const msg = `E2E message ${Date.now()}`;
let savedKey = ""; let savedAt = "";
test.beforeAll(async () => {
  const db = admin();
  const { data: us } = await db.auth.admin.listUsers({ perPage: 200 }); cust = us.users.find(u => u.email === "alex.thompson@example.com")!.id;
  ev = (await db.from("events").select("id").eq("owner_id", cust).eq("management", "consumer").ilike("name", "%wedding%").order("created_at").limit(1).single()).data!.id;
});
test.afterAll(async () => {
  const db = admin();
  await db.from("guests").delete().eq("event_id", ev).eq("name", guest);
  await db.from("messages").delete().eq("body", msg);
  if (savedKey) await db.from("saved_items").upsert({ user_id: cust, item_key: savedKey, created_at: savedAt });
});

test("add a guest", async ({ page }) => {
  await login(page, "customer", `/account/events/${ev}/guests-tickets`);
  await page.goto(`/account/events/${ev}/guests-tickets`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Add guest/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name").fill(guest);
  await dlg.getByLabel("Email").fill(`e2e.guest.${Date.now()}@example.com`);
  await dlg.getByRole("button", { name: /^Add guest/ }).click();
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  await expect.poll(async () => (await admin().from("guests").select("status").eq("event_id", ev).eq("name", guest).maybeSingle()).data?.status, { timeout: 20_000 }).toBe("draft");
  await expect(page.getByText(guest).first()).toBeVisible();
});

test("send a message to a supplier", async ({ page }) => {
  await login(page, "customer", `/account/events/${ev}/messages`);
  await page.goto(`/account/events/${ev}/messages`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(msg);
  await page.getByRole("button", { name: /^Send$/ }).click();
  await expect.poll(async () => (await admin().from("messages").select("sender_id").eq("body", msg).maybeSingle()).data?.sender_id, { timeout: 20_000 }).toBe(cust);
  await expect(page.getByText(msg).first()).toBeVisible();
});

test("remove a saved event", async ({ page }) => {
  const db = admin();
  const { data: s } = await db.from("saved_items").select("item_key,created_at").eq("user_id", cust).like("item_key", "event:%").order("created_at", { ascending: false }).limit(1).single();
  savedKey = s!.item_key; savedAt = s!.created_at;
  const { data: e } = await db.from("events").select("name").eq("id", savedKey.slice(6)).single();
  await login(page, "customer", "/account/saved");
  await page.goto("/account/saved", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^More/ }).first().click();
  await page.getByRole("menuitem", { name: /Remove from saved/ }).click();
  await expect.poll(async () => (await db.from("saved_items").select("item_key").eq("user_id", cust).eq("item_key", savedKey)).data?.length ?? 1, { timeout: 20_000 }).toBe(0);
  await expect(page.locator(".sv-col").first().getByText(e!.name)).toHaveCount(0);
});
