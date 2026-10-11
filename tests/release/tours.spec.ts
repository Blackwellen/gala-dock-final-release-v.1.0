import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login, seedWorkspace } from "../phase1/helpers";

// Release spec §86: anchored guided tour with progress, Back/Next/Skip, saved progress (resume), no repeat once done, ?tour=1 restart.
const db = admin as unknown as SupabaseClient;

test.describe("guided tours", () => {
  let u: { id: string; email: string }, ws: string;
  test.beforeAll(async () => { u = await createUser("tour"); ws = await seedWorkspace(u.id, "organizer", "Tour Org"); });
  test.afterAll(async () => { await db.from("workspaces").delete().eq("id", ws); await cleanup(); });

  test("tour anchors, advances, saves progress, doesn't repeat after skipping, restarts with ?tour=1", async ({ page }) => {
    await login(page, u.email, "/organizer");
    await page.waitForURL(/\/organizer/, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator(".gd-tour-bubble")).toHaveCount(0);      // automation never auto-starts tours
    await page.goto(`${BASE}/organizer?tour=1`);
    const dialog = page.getByRole("dialog", { name: /guide|Hi, I’m/i });
    await expect(page.getByText("Hi, I’m your Gala Dock guide")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/1 of \d+/)).toBeVisible();
    await page.locator(".gd-tour-bubble").getByRole("button", { name: "Next" }).click();
    await expect(page.locator(".gd-tour-bubble h2")).toHaveText("Events");
    await expect(page.locator(".gd-tour-spot")).toBeVisible();          // anchored to the Events nav link
    await expect.poll(async () => (await db.from("user_tours").select("step,status").eq("user_id", u.id).maybeSingle()).data).toMatchObject({ step: 1, status: "in_progress" });
    await page.locator(".gd-tour-bubble").getByRole("button", { name: "Skip tour" }).click();
    await expect(page.locator(".gd-tour-bubble")).toHaveCount(0);
    await expect.poll(async () => (await db.from("user_tours").select("status").eq("user_id", u.id).maybeSingle()).data?.status).toBe("skipped");
    await page.goto(`${BASE}/organizer`);
    await page.waitForTimeout(1500);
    await expect(page.locator(".gd-tour-bubble")).toHaveCount(0);
    await page.goto(`${BASE}/organizer?tour=1`);
    await expect(page.getByText("Hi, I’m your Gala Dock guide")).toBeVisible({ timeout: 20_000 });
    void dialog;
  });
});
