import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// ORG-021: owners edit workspace profile settings (whitelisted fields persist); members can't.
let ws = ""; let before: Record<string, unknown> = {};
test.beforeAll(async () => { const { data } = await admin().from("workspaces").select("id,settings").eq("name", "Alex Events").single(); ws = data!.id; before = (data!.settings ?? {}) as Record<string, unknown>; });
test.afterAll(async () => { await admin().from("workspaces").update({ settings: before, name: "Alex Events" }).eq("id", ws); });

test("edit workspace contact details", async ({ page }) => {
  await login(page, "organizer", "/organizer/settings");
  await page.goto("/organizer/settings", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Edit$/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Contact phone").fill("+44 20 7946 0001");
  await dlg.getByRole("button", { name: /^Save$/ }).click();
  await expect(dlg).toBeHidden({ timeout: 20_000 });
  await expect.poll(async () => ((await admin().from("workspaces").select("settings").eq("id", ws).single()).data!.settings as Record<string, unknown>).contact_phone, { timeout: 20_000 }).toBe("+44 20 7946 0001");
  // Typing into a later field must not leak into the first one (dialog focus regression).
  expect((await admin().from("workspaces").select("name").eq("id", ws).single()).data!.name).toBe("Alex Events");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("+44 20 7946 0001").first()).toBeVisible();
});
