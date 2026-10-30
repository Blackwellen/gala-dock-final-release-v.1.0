import { createHash, randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// W06 (v6 GD-07): agency supplier / provider-team mode. API level, as the browser calls it (RLS-scoped clients).
// Two disposable agencies (A with owner, two managers and a member; B as an unrelated agency). Nothing touches demo data.
// test.fail() marks a known backend gap. The three W06 gaps (assignment race, staff-role direct writes, membership revoke) were closed by
// migrations 202610291023/1024 (lane A, Q12/Q01) and now run as normal tests.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const tokenPair = () => { const token = randomBytes(32).toString("base64url"); return { token, hash: createHash("sha256").update(token).digest("hex") }; };
type U = { id: string; email: string };

test.describe.configure({ mode: "serial" });
test.describe("W06 agency supplier team", () => {
  let owner: U, mgr1: U, mgr2: U, member: U, other: U;
  let ownerC: SupabaseClient, mgr1C: SupabaseClient, mgr2C: SupabaseClient, memberC: SupabaseClient, otherC: SupabaseClient;
  let wsA: string, wsB: string;
  const jobs: string[] = [];

  /** Owner creates the invite exactly as the Settings → Team & access action does (hashed token, owner-only insert). */
  const invite = async (email: string, role: "manager" | "member" | "finance", as: SupabaseClient = ownerC, by = owner.id) => {
    const { hash } = tokenPair();
    const r = await as.from("workspace_invites").insert({ workspace_id: wsA, email: email.toLowerCase(), role, token_hash: hash, invited_by: by });
    return { hash, error: r.error };
  };
  const job = async (name: string, starts: string, ends: string) => {
    const r = await db.from("provider_jobs").insert({ reference: `W06-${randomBytes(4).toString("hex")}`, workspace_id: wsA, mode: "service", source: "direct",
      client_name: "W06 client", event_name: name, starts_at: starts, ends_at: ends, location: "London", status: "confirmed" }).select("id").single();
    expect(r.error).toBeNull();
    jobs.push(r.data!.id); return r.data!.id as string;
  };
  const crew = async (name: string) => {
    const r = await ownerC.rpc("provider_save_crew", { p_ws: wsA, p_crew: null, p: { name, role: "Event Technician", skills: ["Lighting"], details: { employment: "contract" } } });
    expect(r.error).toBeNull(); return r.data as string;
  };

  test.beforeAll(async () => {
    [owner, mgr1, mgr2, member, other] = await Promise.all([createUser("w06-owner"), createUser("w06-mgr1"), createUser("w06-mgr2"), createUser("w06-member"), createUser("w06-other")]);
    [wsA, wsB] = await Promise.all([seedWorkspace(owner.id, "provider", "W06 Agency A"), seedWorkspace(other.id, "provider", "W06 Agency B")]);
    await db.from("workspaces").update({ capabilities: ["service"] }).in("id", [wsA, wsB]);
    [ownerC, mgr1C, mgr2C, memberC, otherC] = await Promise.all([owner, mgr1, mgr2, member, other].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    for (const ws of [wsA, wsB]) {
      await db.from("shifts").delete().eq("workspace_id", ws);
      await db.from("provider_jobs").delete().eq("workspace_id", ws);
      await db.from("availability_blocks").delete().eq("workspace_id", ws);
      await db.from("tasks").delete().eq("workspace_id", ws);
      await db.from("crew_members").delete().eq("workspace_id", ws);
      await db.from("workspace_invites").delete().eq("workspace_id", ws);
      await db.from("workspaces").delete().eq("id", ws);
    }
    await cleanup();
  });

  test("GD-07 member invite → preview → accept gives exactly the invited role", async () => {
    for (const [u, c, role] of [[mgr1, mgr1C, "manager"], [mgr2, mgr2C, "manager"], [member, memberC, "member"]] as const) {
      const { hash, error } = await invite(u.email, role);
      expect(error).toBeNull();
      const preview = await c.rpc("invite_preview", { p_token_hash: hash });
      expect((preview.data as { state: string; role: string }[])[0]).toMatchObject({ state: "valid", role });
      const r = await c.rpc("respond_to_invite", { p_token_hash: hash, p_invite_id: null, p_accept: true });
      expect((r.data as { result: string }).result).toBe("accepted");
      const again = await c.rpc("respond_to_invite", { p_token_hash: hash, p_invite_id: null, p_accept: true });
      expect((again.data as { result: string }).result).toBe("used"); // single use
    }
    const { data } = await db.from("workspace_members").select("user_id,role,status").eq("workspace_id", wsA);
    expect(data?.find(m => m.user_id === member.id)).toMatchObject({ role: "member", status: "active" });
    expect(data?.filter(m => m.role === "manager")).toHaveLength(2);
  });

  test("GD-07 an invite addressed to someone else cannot be accepted", async () => {
    const { hash } = await invite(`w06-${randomBytes(3).toString("hex")}@gala-dock.test`, "manager");
    const r = await memberC.rpc("respond_to_invite", { p_token_hash: hash, p_invite_id: null, p_accept: true });
    expect((r.data as { result: string }).result).toBe("mismatch");
  });

  test("GD-07 role escalation by a member or a manager is refused", async () => {
    // Member promotes themself through the role RPC.
    const self = await memberC.rpc("set_member_role", { p_ws: wsA, p_user: member.id, p_role: "manager" });
    expect(self.error?.message).toMatch(/not_authorized/);
    // Manager promotes a member (owner-only).
    const mgr = await mgr1C.rpc("set_member_role", { p_ws: wsA, p_user: member.id, p_role: "manager" });
    expect(mgr.error?.message).toMatch(/not_authorized/);
    // Direct table writes to memberships are not granted.
    await memberC.from("workspace_members").update({ role: "owner" }).eq("workspace_id", wsA).eq("user_id", member.id);
    // Manager tries to mint an invite (owner-only by RLS) for a new owner-level colleague.
    const minted = await invite(`w06-${randomBytes(3).toString("hex")}@gala-dock.test`, "manager", mgr1C, mgr1.id);
    expect(minted.error).not.toBeNull();
    // Member tries team management RPCs (owner/manager).
    expect((await memberC.rpc("provider_save_crew", { p_ws: wsA, p_crew: null, p: { name: "Sneaky Hire" } })).error?.message).toMatch(/not_authorized/);
    const { data } = await db.from("workspace_members").select("role").eq("workspace_id", wsA).eq("user_id", member.id).single();
    expect(data?.role).toBe("member");
    // The owner can change the role (and the owner role itself is locked).
    expect((await ownerC.rpc("set_member_role", { p_ws: wsA, p_user: member.id, p_role: "finance" })).error).toBeNull();
    expect((await ownerC.rpc("set_member_role", { p_ws: wsA, p_user: owner.id, p_role: "member" })).error?.message).toMatch(/owner_locked/);
    expect((await ownerC.rpc("set_member_role", { p_ws: wsA, p_user: member.id, p_role: "member" })).error).toBeNull();
  });

  test("GD-07 an unrelated agency cannot read or change agency A's team", async () => {
    const c = await crew("Agency A Rigger");
    const j = await job("A-only booking", at(40, 10), at(40, 18));
    for (const t of ["crew_members", "shifts", "workspace_members", "workspace_invites", "provider_jobs"]) {
      const { data } = await otherC.from(t).select("*").eq("workspace_id", wsA);
      expect(data ?? [], `${t} leaked across agencies`).toHaveLength(0);
    }
    expect((await otherC.rpc("provider_save_crew", { p_ws: wsA, p_crew: c, p: { name: "Hijacked" } })).error?.message).toMatch(/not_authorized/);
    expect((await otherC.rpc("provider_set_crew_status", { p_ws: wsA, p_crew: c, p_status: "deactivated" })).error?.message).toMatch(/not_authorized/);
    expect((await otherC.rpc("provider_assign_crew", { p_job: j, p_crew: c, p_role: "Rigger" })).error?.message).toMatch(/not_authorized/);
    expect((await otherC.rpc("team_conflicts", { p_workspace: wsA })).error?.message).toMatch(/not_authorized/);
    // Agency B can't attach A's crew member to B's own booking either.
    const bJob = (await db.from("provider_jobs").insert({ reference: `W06-${randomBytes(4).toString("hex")}`, workspace_id: wsB, mode: "service", source: "direct", client_name: "B", event_name: "B booking",
      starts_at: at(41, 10), ends_at: at(41, 12), status: "confirmed" }).select("id").single()).data!.id as string;
    expect((await otherC.rpc("provider_assign_crew", { p_job: bJob, p_crew: c, p_role: "Rigger" })).error?.message).toMatch(/not_authorized/);
    const { data: still } = await db.from("crew_members").select("name,status").eq("id", c).single();
    expect(still).toMatchObject({ name: "Agency A Rigger", status: "available" });
  });

  test("GD-07 two managers assigning one freelancer to overlapping bookings, one after the other: the second is refused", async () => {
    const f = await crew("Freelancer Seq");
    const [j1, j2] = [await job("Gala A", at(30, 17), at(30, 23)), await job("Gala B", at(30, 19), at(30, 22))];
    expect((await mgr1C.rpc("provider_assign_crew", { p_job: j1, p_crew: f, p_role: "Lighting" })).error).toBeNull();
    const second = await mgr2C.rpc("provider_assign_crew", { p_job: j2, p_crew: f, p_role: "Lighting" });
    expect(second.error?.message).toMatch(/crew_conflict/);
  });

  // provider_assign_crew checks for overlap and then inserts, with no row lock or exclusion constraint on shifts, so two managers
  // submitting at the same moment can both pass the check. Reproduced over HTTP on 2026-10-28 (intermittently: 0 of 6 pairs in one run,
  // 1+ of 6 in the next), hence 15 pairs. Depends on Q12/Q17 (lane A): lock the crew row or add a shifts exclusion constraint, then drop test.fail.
  test("Q12: two managers assigning one freelancer to overlapping bookings at the same moment: exactly one wins", async () => {
    let doubled = 0;
    for (let i = 0; i < 15; i++) {
      const f = await crew(`Freelancer Race ${i}`);
      const [j1, j2] = [await job(`Race A${i}`, at(50 + i, 17), at(50 + i, 23)), await job(`Race B${i}`, at(50 + i, 18), at(50 + i, 22))];
      const r = await Promise.all([mgr1C.rpc("provider_assign_crew", { p_job: j1, p_crew: f, p_role: "Lighting" }), mgr2C.rpc("provider_assign_crew", { p_job: j2, p_crew: f, p_role: "Lighting" })]);
      if (r.every(x => !x.error)) doubled++;
    }
    test.info().annotations.push({ type: "doubled", description: `${doubled} of 15 pairs` });
    expect(doubled, "the same freelancer was assigned to overlapping bookings by two managers at once").toBe(0);
  });

  test("Q12/Q01: a member (staff role) cannot bypass team RPCs with direct table writes", async () => {
    const f = await crew("Colleague");
    const j = await job("Bypass booking", at(60, 10), at(60, 16));
    // Staff role is refused by provider_set_crew_status / provider_assign_crew, but crew_members and shifts are writable by any workspace member (RLS is_workspace_member).
    const deact = await memberC.from("crew_members").update({ status: "deactivated" }).eq("id", f).select("id");
    const shift = await memberC.from("shifts").insert({ workspace_id: wsA, crew_id: f, job_id: j, role: "Lighting", title: "Self-assigned", starts_at: at(60, 10), ends_at: at(60, 16), status: "confirmed" }).select("id");
    const changed = (deact.data?.length ?? 0) + (shift.data?.length ?? 0);
    expect(changed, "a staff-role member deactivated a colleague / wrote a confirmed shift directly").toBe(0);
  });

  test("GD-07 member departure while assigned: deactivation is refused until shifts are reassigned", async () => {
    const f = await crew("Leaver");
    const j = await job("Leaver booking", at(70, 10), at(70, 16));
    const sid = (await mgr1C.rpc("provider_assign_crew", { p_job: j, p_crew: f, p_role: "Lighting" })).data as string;
    const refused = await mgr1C.rpc("provider_set_crew_status", { p_ws: wsA, p_crew: f, p_status: "deactivated" });
    expect(refused.error?.message).toMatch(/has_upcoming_shifts/);
    // Reassign to a colleague, then the leaver can be deactivated with history kept.
    const g = await crew("Cover");
    expect((await db.from("shifts").update({ crew_id: g }).eq("id", sid)).error).toBeNull();
    expect((await mgr1C.rpc("provider_set_crew_status", { p_ws: wsA, p_crew: f, p_status: "deactivated" })).error).toBeNull();
    const { data } = await db.from("crew_members").select("status").eq("id", f).single();
    expect(data?.status).toBe("deactivated");
    // A deactivated person can't be assigned again.
    const j2 = await job("After leaving", at(71, 10), at(71, 16));
    expect((await mgr1C.rpc("provider_assign_crew", { p_job: j2, p_crew: f, p_role: "Lighting" })).error?.message).toMatch(/not_authorized/);
  });

  test("Q01: the owner can revoke a departed member's workspace access (revoke_workspace_member RPC, migration 202610291024)", async () => {
    // Direct table writes stay closed (no client UPDATE policy on workspace_members); the owner-only RPC is the path.
    expect((await mgr1C.rpc("revoke_workspace_member", { p_ws: wsA, p_user: mgr2.id, p_status: "revoked", p_reason: "not owner" })).error?.message).toMatch(/not_authorized/);
    expect((await ownerC.rpc("revoke_workspace_member", { p_ws: wsA, p_user: owner.id, p_status: "revoked", p_reason: "self" })).error).not.toBeNull();
    expect((await ownerC.rpc("revoke_workspace_member", { p_ws: wsA, p_user: mgr2.id, p_status: "revoked", p_reason: "Left the agency" })).error).toBeNull();
    expect((await db.from("workspace_members").select("status").eq("workspace_id", wsA).eq("user_id", mgr2.id).single()).data?.status).toBe("revoked");
    expect((await mgr2C.from("crew_members").select("id").eq("workspace_id", wsA)).data ?? []).toHaveLength(0); // access is gone
    expect((await db.from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", wsA).eq("event", "workspace.member_revoked")).count).toBe(1);
  });
});
