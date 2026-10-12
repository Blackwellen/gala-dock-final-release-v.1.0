import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, cleanup, createUser, login, signedIn } from "../phase1/helpers";

// Release spec §7: passkeys. The WebAuthn ceremony itself is bound to galadock.com (relying-party ID), so locally we verify the UI and
// that the project's passkey API is enabled and scoped to the signed-in user.
test.describe("passkeys", () => {
  test.afterAll(async () => { await cleanup(); });

  test("login offers passkey sign-in and account security lists passkeys", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
    const u = await createUser("passkey");
    const c = await signedIn(u.email) as unknown as SupabaseClient;
    const list = await c.auth.passkey.list();
    expect(list.error).toBeNull();
    expect(list.data).toEqual([]);
    await login(page, u.email, "/account?tab=security");
    await page.waitForURL(/\/account/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Add a passkey" })).toBeVisible();
  });
});
