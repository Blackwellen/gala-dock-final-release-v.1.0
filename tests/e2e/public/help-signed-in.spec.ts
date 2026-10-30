import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, login } from "../../phase1/helpers";

// The one Help Centre, signed in (owner 2026-10-29): avatar in the public header, the visitor's own guides first, the contact form
// tied to where they came from, and the public footer. Disposable customer + organiser (E2E_AUTH_FIXTURE=otp); removed afterwards.
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_AUTH_FIXTURE !== "otp", "needs the OTP auth fixture");

let C: { id: string; email: string }, O: { id: string; email: string }, W = "";
test.beforeAll(async () => {
  [C, O] = await Promise.all([createUser("hc-cust", "Help Customer"), createUser("hc-org", "Help Organiser")]);
  W = await seedWorkspace(O.id, "organizer", "HC Organiser Workspace");
});
test.afterAll(async () => { if (W) await (admin as unknown as SupabaseClient).from("workspaces").delete().eq("id", W); await cleanup(); });

for (const width of [390, 1536]) {
  test(`customer @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, C.email, "/help");
    await expect(page).toHaveURL(/\/help/);
    await expect(page.locator("header.pub-top .c-avatar")).toBeVisible();
    await expect(page.locator(".hc-group h2").first()).toHaveText("For customers");
    await expect(page.getByTestId("help-context")).toContainText("Customer account");
    await expect(page.locator(".dir-footer")).toBeVisible();
  });
  test(`organiser via /organizer/help @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, O.email, "/organizer/help");
    await expect(page).toHaveURL(/\/help\?from=organizer/);
    await expect(page.locator("header.pub-top .c-avatar")).toBeVisible();
    await expect(page.locator(".hc-group h2").first()).toHaveText("For organizers");
    await expect(page.getByTestId("help-context")).toContainText("Organizer workspace");
    await expect(page.getByTestId("help-context")).toContainText("workspace is attached");
    await expect(page.locator(".dir-footer")).toBeVisible();
  });
}
