import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login, seedWorkspace, signedIn, totp } from "../phase1/helpers";

// Release spec §7–8: workspace MFA policy, enforcement without lock-out, recovery codes.
const db = admin as unknown as SupabaseClient;
const hash = (c: string) => createHash("sha256").update(`gd-recovery:${c.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`).digest("hex");

async function enrol(email: string) {
  const c = await signedIn(email) as unknown as SupabaseClient;
  const { data } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: "e2e" });
  const { error } = await c.auth.mfa.challengeAndVerify({ factorId: data!.id, code: totp(data!.totp.secret) });
  expect(error).toBeNull();
  return c;
}

test.describe("workspace MFA", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string }, ws: string;
  test.beforeAll(async () => {
    [owner, member] = await Promise.all([createUser("mfa-o"), createUser("mfa-m")]);
    ws = await seedWorkspace(owner.id, "organizer", "MFA Org");
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: member.id, role: "member", status: "active" });
  });
  test.afterAll(async () => { await db.from("workspaces").delete().eq("id", ws); await cleanup(); });

  test("only an MFA-verified owner can require MFA", async () => {
    const plain = await signedIn(owner.email) as unknown as SupabaseClient;
    expect((await plain.rpc("set_workspace_mfa_policy", { p_workspace: ws, p_policy: "all" })).error?.message).toMatch(/owner_mfa_required/);
    const m = await signedIn(member.email) as unknown as SupabaseClient;
    expect((await m.rpc("set_workspace_mfa_policy", { p_workspace: ws, p_policy: "optional" })).error?.message).toMatch(/not_authorized/);
    const verified = await enrol(owner.email);
    expect((await verified.rpc("set_workspace_mfa_policy", { p_workspace: ws, p_policy: "all" })).error).toBeNull();
    const { data } = await db.from("workspaces").select("settings").eq("id", ws).single();
    expect((data!.settings as { security: { mfa_policy: string } }).security.mfa_policy).toBe("all");
  });

  test("a member without MFA is sent to set it up, not locked out", async ({ page }) => {
    await login(page, member.email, "/organizer");
    await page.waitForURL(/\/account\?tab=security&mfa=required/, { timeout: 30_000 });
    await expect(page.getByRole("alert").filter({ hasText: "requires two-step verification" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up authenticator" })).toBeVisible();
  });

  test("a recovery code removes the lost authenticator once, and only once", async ({ page }) => {
    const u = await createUser("mfa-r");
    await enrol(u.email);
    await db.from("mfa_recovery_codes").insert({ user_id: u.id, code_hash: hash("ABCDE-FGHJK") });
    await login(page, u.email, "/account");
    await page.waitForURL(/\/mfa/, { timeout: 30_000 });
    const post = (code: string) => page.request.post(`${BASE}/api/auth/mfa-recover`, { data: { code }, headers: { Origin: BASE } });
    expect((await post("ZZZZZ-ZZZZZ")).status()).toBe(400);
    const ok = await post("abcde-fghjk");
    expect(ok.status()).toBe(200);
    const { data: f } = await db.auth.admin.mfa.listFactors({ userId: u.id });
    expect(f!.factors.length).toBe(0);
    expect((await post("ABCDE-FGHJK")).status()).toBe(400);
  });
});
