import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login, seedWorkspace, signedIn } from "../phase1/helpers";

// Q01 P1 (lane B W10): owner invite / revoke commands (migration 202610292008). Disposable identities, RLS-bound clients;
// service role only for fixtures and for reading the audit trail.
type U = { id: string; email: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const hash = () => createHash("sha256").update(randomBytes(32)).digest("hex");
const token = () => randomBytes(32).toString("base64url");

test.describe.configure({ mode: "serial" });

test.describe("workspace invitations (owner commands)", () => {
  let O: U, Mg: U, Mb: U, X: U, I1: U, I2: U;
  let oc: SupabaseClient, mg: SupabaseClient, mb: SupabaseClient, xc: SupabaseClient;
  let W: string, XW: string;

  test.beforeAll(async () => {
    [O, Mg, Mb, X, I1, I2] = await Promise.all([createUser("inv-owner"), createUser("inv-mgr"), createUser("inv-member"), createUser("inv-other"), createUser("inv-new1"), createUser("inv-new2")]);
    W = await seedWorkspace(O.id, "provider", "Invite Co");
    XW = await seedWorkspace(X.id, "organizer", "Other Invite Co");
    await db.from("workspace_members").insert([{ workspace_id: W, user_id: Mg.id, role: "manager", status: "active" }, { workspace_id: W, user_id: Mb.id, role: "member", status: "active" }]);
    [oc, mg, mb, xc] = await Promise.all([as(O), as(Mg), as(Mb), as(X)]);
  });
  test.afterAll(async () => {
    await db.from("workspaces").delete().in("id", [W, XW]);
    await cleanup();
  });

  test("direct table writes: non-owners refused by RLS; columns outside the legacy grant (crew_id) refused", async () => {
    // Legacy column grants (INSERT on 6 columns, UPDATE revoked_at) stay until the command-based code is deployed.
    expect((await mg.from("workspace_invites").insert({ workspace_id: W, email: "direct@gala-dock.test", role: "member", token_hash: hash(), invited_by: Mg.id })).error?.message).toMatch(/row-level security/);
    expect((await oc.from("workspace_invites").insert({ workspace_id: W, email: "direct@gala-dock.test", role: "member", token_hash: hash(), invited_by: O.id, crew_id: null })).error?.message).toMatch(/permission denied/);
  });

  test("owner invites → invited person accepts → active membership with the invited role; token single-use", async () => {
    const h = hash();
    const { data: id, error } = await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: I1.email.toUpperCase(), p_role: "finance", p_token_hash: h });
    expect(error).toBeNull();
    const row = (await db.from("workspace_invites").select("email,role,invited_by,token_hash").eq("id", id).single()).data as Record<string, string>;
    expect(row).toMatchObject({ email: I1.email, role: "finance", invited_by: O.id, token_hash: h });
    // email-bound: another account cannot use the link
    expect(((await (await as(I2)).rpc("respond_to_invite", { p_token_hash: h, p_invite_id: null, p_accept: true })).data as { result: string }).result).toBe("mismatch");
    const i1 = await as(I1);
    expect(((await i1.rpc("respond_to_invite", { p_token_hash: h, p_invite_id: null, p_accept: true })).data as { result: string }).result).toBe("accepted");
    const m = (await db.from("workspace_members").select("role,status").eq("workspace_id", W).eq("user_id", I1.id).single()).data;
    expect(m).toEqual({ role: "finance", status: "active" });
    expect(((await i1.rpc("respond_to_invite", { p_token_hash: h, p_invite_id: null, p_accept: true })).data as { result: string }).result).toBe("used");
    // accepted invites cannot be revoked; existing members cannot be re-invited
    expect((await oc.rpc("revoke_workspace_invite", { p_invite: id })).error?.message).toMatch(/invite_already_used/);
    expect((await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: I1.email, p_role: "member", p_token_hash: hash() })).error?.message).toMatch(/already_member/);
    const audit = ((await db.from("audit_events").select("event,actor_id").eq("workspace_id", W).in("event", ["invite.created", "invite.accepted"])).data ?? []) as { event: string; actor_id: string }[];
    expect(audit).toEqual(expect.arrayContaining([{ event: "invite.created", actor_id: O.id }, { event: "invite.accepted", actor_id: I1.id }]));
  });

  test("manager, member and another workspace's owner are refused; bad input is refused", async () => {
    for (const c of [mg, mb, xc]) expect((await c.rpc("create_workspace_invite", { p_workspace: W, p_email: I2.email, p_role: "member", p_token_hash: hash() })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("create_workspace_invite", { p_workspace: XW, p_email: I2.email, p_role: "member", p_token_hash: hash() })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: I2.email, p_role: "owner", p_token_hash: hash() })).error?.message).toMatch(/invalid_role/);
    expect((await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: "not-an-email", p_role: "member", p_token_hash: hash() })).error?.message).toMatch(/invalid_email/);
    expect((await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: I2.email, p_role: "member", p_token_hash: "plain-token" })).error?.message).toMatch(/invalid_token/);
    expect((await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: O.email, p_role: "member", p_token_hash: hash() })).error?.message).toMatch(/self_invite/);
    expect(((await db.from("workspace_invites").select("id").eq("workspace_id", W).eq("email", I2.email)).data ?? []).length).toBe(0);
  });

  test("revoke: owner only (cross-workspace refused), idempotent, revoked link cannot be accepted; one pending per email", async () => {
    const h = hash();
    const { data: id } = await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: I2.email, p_role: "member", p_token_hash: h });
    expect(id).toBeTruthy();
    expect((await oc.rpc("create_workspace_invite", { p_workspace: W, p_email: I2.email, p_role: "member", p_token_hash: hash() })).error?.code).toBe("23505");
    for (const c of [mg, mb, xc]) expect((await c.rpc("revoke_workspace_invite", { p_invite: id })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("revoke_workspace_invite", { p_invite: id })).data).toBe(true);
    expect((await oc.rpc("revoke_workspace_invite", { p_invite: id })).data).toBe(false);
    expect(((await (await as(I2)).rpc("respond_to_invite", { p_token_hash: h, p_invite_id: null, p_accept: true })).data as { result: string }).result).toBe("revoked");
    expect((await db.from("workspace_members").select("user_id").eq("workspace_id", W).eq("user_id", I2.id)).data).toEqual([]);
    expect(((await db.from("audit_events").select("event").eq("workspace_id", W).eq("event", "invite.revoked")).data ?? []).length).toBe(1);
    expect((await oc.rpc("revoke_workspace_invite", { p_invite: "00000000-0000-4000-8000-000000000000" })).error?.message).toMatch(/not_authorized/);
  });

  test("POST /api/invites (owner session) creates a working link; a member's session is refused", async ({ page }) => {
    await login(page, O.email, "/provider");
    await page.waitForURL(/\/provider/, { timeout: 90_000 });
    const res = await page.request.post(`${BASE}/api/invites`, { headers: { Origin: BASE, "Content-Type": "application/json" }, data: { workspaceId: W, email: `inv-api-${randomBytes(3).toString("hex")}@gala-dock.test`, role: "member" } });
    expect(res.status()).toBe(200);
    const { inviteUrl } = await res.json() as { inviteUrl: string };
    expect(inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);
    expect(res.headers()["cache-control"]).toContain("no-store");
    await page.context().clearCookies();
    await login(page, Mb.email, "/provider");
    await page.waitForURL(/\/provider/, { timeout: 90_000 });
    const refused = await page.request.post(`${BASE}/api/invites`, { headers: { Origin: BASE, "Content-Type": "application/json" }, data: { workspaceId: W, email: `inv-api2-${token().slice(0, 6)}@gala-dock.test`, role: "member" } });
    expect(refused.status()).toBe(403);
  });
});
