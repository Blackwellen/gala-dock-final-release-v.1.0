import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// CU-004 build canvas: add a provider option from the canvas, then remove it again (unbooked options delete cleanly).
let ev = ""; const started = new Date().toISOString();
test.beforeAll(async () => {
  const db = admin(); const { data: us } = await db.auth.admin.listUsers({ perPage: 200 }); const cust = us.users.find(u => u.email === "alex.thompson@example.com")!.id;
  ev = (await db.from("events").select("id").eq("owner_id", cust).eq("management", "consumer").ilike("name", "%wedding%").order("created_at").limit(1).single()).data!.id;
});
test.afterAll(async () => { await admin().from("build_items").delete().eq("event_id", ev).gte("created_at", started).in("status", ["suggested", "draft"]); });

test("add an option to the build and remove it", async ({ page }) => {
  await login(page, "customer", `/account/events/${ev}/build`);
  await page.goto(`/account/events/${ev}/build`, { waitUntil: "networkidle" });
  await page.locator(".cb-more .cb-add-tile").click();
  const dlg = page.getByRole("dialog");
  const add = dlg.getByRole("button", { name: /^Add$/ });
  test.skip(!(await add.count()), "no providers listed for this category");
  const name = (await dlg.locator(".cb-pick-row").first().locator("b").first().innerText()).trim();
  await add.first().click();
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  const db = admin();
  await expect.poll(async () => (await db.from("build_items").select("id").eq("event_id", ev).gte("created_at", started)).data?.length ?? 0, { timeout: 20_000 }).toBe(1);
  const { data: it } = await db.from("build_items").select("id,title,status").eq("event_id", ev).gte("created_at", started).single();
  expect(it!.title).toContain(name.split(" ")[0]!);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Options for ${it!.title}` }).first().click();
  await page.getByRole("menuitem", { name: /Remove option/ }).click();
  await expect.poll(async () => (await db.from("build_items").select("id").eq("id", it!.id)).data?.length ?? 1, { timeout: 20_000 }).toBe(0);
});
