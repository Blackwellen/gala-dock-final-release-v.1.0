import { test, expect } from "@playwright/test";
import { login, admin, userClient } from "../p2-helpers";

// CU-013: profile edit (whitelisted RPC), notification toggle persists, calendar feed works and is token-gated, data export.
test("edit profile, toggle a notification, calendar feed and export", async ({ page }) => {
  await login(page, "customer", "/account");
  await page.goto("/account", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Edit profile details" });
  await dlg.getByLabel("Bio (optional)").fill("I love discovering unique venues and organising amazing experiences with friends and family!");
  await dlg.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".ac-bio")).toContainText("family!");
  const marketing = page.getByRole("switch", { name: "Marketing updates" });
  const before = await marketing.getAttribute("aria-checked");
  await marketing.click();
  await expect.poll(async () => { const { data } = await admin().from("profiles").select("notifications").eq("full_name", "Alex Thompson").single(); return String((data!.notifications as Record<string, boolean>).marketing); }).toBe(before === "true" ? "false" : "true");
  await marketing.click();
  await page.getByRole("button", { name: "Connect" }).first().click();
  const code = page.locator(".ac-feed code"); await expect(code).toBeVisible();
  const feed = await page.request.get((await code.textContent())!);
  expect(feed.status()).toBe(200); expect(await feed.text()).toContain("BEGIN:VCALENDAR");
  expect((await page.request.get("/api/calendar/" + "0".repeat(48))).status()).toBe(404);
  const exp = await page.request.get("/api/account/export");
  expect(exp.status()).toBe(200); expect((await exp.json()).account.email).toBe("alex.thompson@example.com");
});

test("profile RPC rejects protected fields and other users' feeds are not readable", async () => {
  const c = await userClient("customer");
  await c.rpc("update_my_profile", { p: { identity_verified: true, status: "admin" } });
  const { data } = await admin().from("profiles").select("status,identity_verified").eq("full_name", "Alex Thompson").single();
  expect(data!.status).not.toBe("admin");
  const { error } = await c.rpc("calendar_feed" as never, { p_token: "x".repeat(48) } as never);
  expect(error).toBeTruthy();
});
