import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, cleanup, createUser, signedIn } from "../phase1/helpers";

// Release spec §6: session list + sign out other devices; admin idle timeout.
test.describe("sessions", () => {
  test.afterAll(async () => { await cleanup(); });

  test("lists own sessions and revokes the others, keeping the current one", async () => {
    const u = await createUser("sess");
    const a = await signedIn(u.email) as unknown as SupabaseClient, b = await signedIn(u.email) as unknown as SupabaseClient;
    const list = (await a.rpc("my_sessions")).data as { id: string; current: boolean }[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.filter(s => s.current).length).toBe(1);
    expect((await a.rpc("revoke_other_sessions")).data).toBeGreaterThanOrEqual(1);
    expect(((await a.rpc("my_sessions")).data as unknown[]).length).toBe(1);
    // The revoked device can no longer refresh.
    expect((await b.auth.refreshSession()).error).not.toBeNull();
  });

  test("a stale admin activity cookie forces admin re-authentication", async ({ context, page }) => {
    await context.addCookies([{ name: "gd_admin_seen", value: String(Date.now() - 31 * 60_000), url: BASE }]);
    const res = await page.goto(`${BASE}/admin`);
    expect(page.url()).toContain("/admin/login?reason=idle");
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByText("signed out after 30 minutes of inactivity")).toBeVisible();
  });
});
