import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, BASE } from "../helpers";

// Every assertion below is made with an ordinary user (or anonymous) client against the live
// project's REST/RPC endpoints — the same path the browser uses — never with the service role.
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
async function invite(workspaceId: string, ownerId: string, email: string, role = "member", extra: Record<string, unknown> = {}) {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin.from("workspace_invites").insert({ workspace_id: workspaceId, email, role, token_hash: hash(token), invited_by: ownerId, ...extra }).select("id").single();
  if (error) throw error;
  return { token, id: data.id };
}

test.describe("Supabase RLS and authorization", () => {
  let owner: { id: string; email: string }, other: { id: string; email: string }, member: { id: string; email: string };
  let orgId: string, provId: string;

  test.beforeAll(async () => {
    owner = await createUser("owner", "Olivia Owner");
    other = await createUser("other", "Oscar Other");
    member = await createUser("member", "Mia Member");
    orgId = await seedWorkspace(owner.id, "organizer", "Owner Organizer");
    provId = await seedWorkspace(owner.id, "provider", "Owner Provider");
  });
  test.afterAll(cleanup);

  test("owner membership is created automatically with the workspace", async () => {
    const { data } = await admin.from("workspace_members").select("role,status").eq("workspace_id", orgId).eq("user_id", owner.id).single();
    expect(data).toEqual({ role: "owner", status: "active" });
  });

  test("profiles are isolated between identities", async () => {
    const client = await signedIn(other.email);
    const { data } = await client.from("profiles").select("id").eq("id", owner.id);
    expect(data).toEqual([]);
  });

  test("another account cannot read, update or join a private workspace (IDOR/BOLA)", async () => {
    const client = await signedIn(other.email);
    expect((await client.from("workspaces").select("id").eq("id", orgId)).data).toEqual([]);
    const update = await client.from("workspaces").update({ name: "Hijacked" }).eq("id", orgId).select("id");
    expect(update.data ?? []).toEqual([]);
    const join = await client.from("workspace_members").insert({ workspace_id: orgId, user_id: other.id, role: "owner" });
    expect(join.error).not.toBeNull();
    const { data } = await admin.from("workspaces").select("name").eq("id", orgId).single();
    expect(data?.name).toBe("Owner Organizer");
  });

  test("owners cannot self-verify, self-connect payouts, unsuspend or force-complete via REST", async () => {
    const client = await signedIn(owner.email);
    for (const patch of [{ verification_status: "verified" }, { payout_status: "active" }, { status: "active" }, { onboarding_complete: true }, { stripe_account_id: "acct_fake" }]) {
      const { error } = await client.from("workspaces").update(patch as never).eq("id", provId);
      expect(error, JSON.stringify(patch)).not.toBeNull();
    }
    const { data } = await admin.from("workspaces").select("verification_status,payout_status").eq("id", provId).single();
    expect(data).toEqual({ verification_status: "unverified", payout_status: "not_connected" });
  });

  test("listings cannot be published by writing the column; publish_listing enforces readiness", async () => {
    const client = await signedIn(owner.email);
    const created = await client.from("listings").insert({ workspace_id: provId, name: "Draft Hall", kind: "venue", description: "short", location: "" }).select("id").single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    expect((await client.from("listings").update({ published: true } as never).eq("id", id)).error).not.toBeNull();
    expect((await client.from("listings").insert({ workspace_id: provId, name: "Sneaky", kind: "venue", published: true } as never)).error).not.toBeNull();
    const { data, error } = await client.rpc("publish_listing", { p_listing: id });
    expect(error).toBeNull();
    const result = data as { eligible: boolean; missing: string[] };
    expect(result.eligible).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["listing_description", "listing_location", "listing_photo", "verification", "payouts"]));
    expect((await admin.from("listings").select("published").eq("id", id).single()).data?.published).toBe(false);
    // Another user cannot publish or read readiness of someone else's draft.
    const stranger = await signedIn(other.email);
    expect((await stranger.rpc("publish_listing", { p_listing: id })).error).not.toBeNull();
    expect((await anon().from("listings").select("id").eq("id", id)).data).toEqual([]);
  });

  test("platform admin cannot be self-assigned", async () => {
    const client = await signedIn(other.email);
    expect((await client.from("platform_admins").insert({ user_id: other.id })).error).not.toBeNull();
  });

  test("anonymous callers cannot use signed-in RPCs; internal tables are closed", async () => {
    const a = anon();
    expect((await a.rpc("my_workspace_access")).error).not.toBeNull();
    expect((await a.rpc("complete_customer_onboarding")).error).not.toBeNull();
    const user = await signedIn(other.email);
    expect((await user.from("rate_limits" as never).select("*")).error).not.toBeNull();
    expect((await user.rpc("hit_rate_limit" as never, { p_key: "x", p_max: 1, p_window_seconds: 1 } as never)).error).not.toBeNull();
  });

  test("invitations: only the addressed identity can accept; single use; role never replaced", async () => {
    const inv = await invite(orgId, owner.id, member.email, "manager");
    const wrong = await signedIn(other.email);
    expect((await wrong.rpc("respond_to_invite", { p_token_hash: hash(inv.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "mismatch" });
    const right = await signedIn(member.email);
    expect((await right.rpc("respond_to_invite", { p_token_hash: hash(inv.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "accepted" });
    expect((await right.rpc("respond_to_invite", { p_token_hash: hash(inv.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "used" });
    // A second invite with a different role does not change the existing membership.
    const second = await invite(orgId, owner.id, member.email, "finance");
    expect((await right.rpc("respond_to_invite", { p_token_hash: hash(second.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "already_member" });
    expect((await admin.from("workspace_members").select("role").eq("workspace_id", orgId).eq("user_id", member.id).single()).data?.role).toBe("manager");
    // Members cannot invite or promote themselves.
    expect((await right.from("workspace_invites").insert({ workspace_id: orgId, email: "x@gala-dock.test", role: "manager", token_hash: hash("x"), invited_by: member.id })).error).not.toBeNull();
    expect((await right.from("workspace_members").update({ role: "owner" } as never).eq("workspace_id", orgId).eq("user_id", member.id).select()).data ?? []).toEqual([]);
  });

  test("expired, revoked and declined invitations cannot be accepted", async () => {
    const recipient = await createUser("recipient");
    const client = await signedIn(recipient.email);
    const expired = await invite(provId, owner.id, recipient.email, "member", { expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect((await client.rpc("respond_to_invite", { p_token_hash: hash(expired.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "expired" });
    await admin.from("workspace_invites").delete().eq("id", expired.id);
    const revoked = await invite(provId, owner.id, recipient.email, "member", { revoked_at: new Date().toISOString() });
    expect((await client.rpc("respond_to_invite", { p_token_hash: hash(revoked.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "revoked" });
    await admin.from("workspace_invites").delete().eq("id", revoked.id);
    const declined = await invite(provId, owner.id, recipient.email);
    expect((await client.rpc("respond_to_invite", { p_token_hash: hash(declined.token), p_invite_id: null, p_accept: false } as never)).data).toMatchObject({ result: "declined" });
    expect((await client.rpc("respond_to_invite", { p_token_hash: hash(declined.token), p_invite_id: null, p_accept: true } as never)).data).toMatchObject({ result: "declined" });
    expect((await admin.from("workspace_members").select("user_id").eq("workspace_id", provId).eq("user_id", recipient.id)).data).toEqual([]);
  });

  test("invite preview exposes no recipient email and unknown tokens are unavailable", async () => {
    const inv = await invite(provId, owner.id, "preview-target@gala-dock.test");
    const { data } = await anon().rpc("invite_preview", { p_token_hash: hash(inv.token) });
    expect(data?.[0]).toMatchObject({ workspace_name: "Owner Provider", state: "valid" });
    expect(JSON.stringify(data)).not.toContain("preview-target");
    expect((await anon().rpc("invite_preview", { p_token_hash: hash("nope") })).data).toEqual([]);
  });

  test("suspended membership loses access immediately; other workspaces unaffected", async () => {
    const client = await signedIn(member.email);
    expect((await client.from("workspaces").select("id").eq("id", orgId)).data).toHaveLength(1);
    await admin.from("workspace_members").update({ status: "suspended" }).eq("workspace_id", orgId).eq("user_id", member.id);
    expect((await client.from("workspaces").select("id").eq("id", orgId)).data).toEqual([]);
    const access = (await client.rpc("my_workspace_access")).data ?? [];
    expect(access.find(w => w.id === orgId)?.member_status).toBe("suspended");
    await admin.from("workspace_members").update({ status: "active" }).eq("workspace_id", orgId).eq("user_id", member.id);
  });

  test("a suspended workspace blocks member access", async () => {
    await admin.from("workspaces").update({ status: "suspended" }).eq("id", orgId);
    const client = await signedIn(member.email);
    expect((await client.from("workspaces").select("id").eq("id", orgId)).data).toEqual([]);
    await admin.from("workspaces").update({ status: "active" }).eq("id", orgId);
  });

  test("open redirects are rejected by /continue and auth callbacks", async ({ request }) => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2F%2Fevil.example", "javascript:alert(1)"]) {
      const response = await request.get(`${BASE}/auth/callback?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      const location = response.headers()["location"] ?? "";
      expect(new URL(location, BASE).origin, next).toBe(new URL(BASE).origin);
    }
  });

  test("state-changing APIs reject cross-origin requests and unauthenticated callers", async ({ request }) => {
    const cross = await request.post(`${BASE}/api/onboarding`, { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: { flow: "organizer", step: "organisation", values: {} } });
    expect(cross.status()).toBe(403);
    for (const path of ["/api/onboarding", "/api/invites", "/api/uploads", "/api/payouts", "/api/agent/onboarding"]) {
      const response = await request.post(`${BASE}${path}`, { data: {} });
      expect([401, 403], path).toContain(response.status());
    }
  });

  test("private pages are not cacheable and security headers are present", async ({ request }) => {
    const response = await request.get(`${BASE}/login`);
    const headers = response.headers();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
