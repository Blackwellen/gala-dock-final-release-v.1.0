import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Release spec §88–91: DSAR tracking, deletion blockers, erasure after the grace period, complete self-export.
const db = admin as unknown as SupabaseClient;
const bearer = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
test.describe("privacy", () => {
  test.afterAll(async () => { await cleanup(); });

  test("requests are tracked with a one-month deadline and duplicates refused", async () => {
    const u = await createUser("dsar");
    const c = await signedIn(u.email) as unknown as SupabaseClient;
    const { data: ref, error } = await c.rpc("submit_privacy_request", { p_kind: "access", p_detail: "" });
    expect(error).toBeNull(); expect(String(ref)).toMatch(/^PR-/);
    expect((await c.rpc("submit_privacy_request", { p_kind: "access", p_detail: "" })).error?.message).toMatch(/already_open/);
    const { data: r } = await c.from("privacy_requests").select("due_at,received_at,status").single();
    expect(new Date(r!.due_at).getTime() - new Date(r!.received_at).getTime()).toBeGreaterThan(27 * 864e5);
    // Customers can't progress their own request.
    expect((await c.rpc("update_privacy_request", { p_id: "00000000-0000-0000-0000-000000000000", p_status: "completed", p_note: "x" })).error).not.toBeNull();
  });

  test("ownership of a shared workspace blocks erasure; after the grace period the worker erases and bans", async ({ request }) => {
    const [owner, member, colleague] = await Promise.all([createUser("del-o"), createUser("del-m"), createUser("del-c")]);
    const ws = await seedWorkspace(owner.id, "organizer", "Del Org");
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: colleague.id, role: "member", status: "active" });
    const blockers = (await db.rpc("deletion_blockers", { p_user: owner.id })).data as { code: string }[];
    expect(blockers.map(b => b.code)).toContain("workspace_owner");
    // A plain customer past the grace period is erased.
    await db.from("saved_items").insert({ user_id: member.id, item_key: "listing:x" });
    await db.from("profiles").update({ deletion_requested_at: new Date(Date.now() - 15 * 864e5).toISOString(), phone: "+447700900123" }).eq("id", member.id);
    await db.from("profiles").update({ deletion_requested_at: new Date(Date.now() - 15 * 864e5).toISOString() }).eq("id", owner.id);
    const res = await request.post(`${BASE}/api/cron/privacy`, { headers: bearer });
    expect(res.ok()).toBe(true);
    const { data: p } = await db.from("profiles").select("full_name,phone,deleted_at").eq("id", member.id).single();
    expect(p).toMatchObject({ full_name: "Deleted user", phone: null });
    expect(p!.deleted_at).not.toBeNull();
    expect((await db.from("saved_items").select("item_key").eq("user_id", member.id)).data).toEqual([]);
    const { data: au } = await db.auth.admin.getUserById(member.id);
    expect(au.user!.email).toBe(`deleted+${member.id}@users.invalid`);
    // The blocked owner is untouched and told why.
    expect((await db.from("profiles").select("deleted_at").eq("id", owner.id).single()).data!.deleted_at).toBeNull();
    expect((await db.from("notifications").select("title").eq("user_id", owner.id).eq("title", "Your account deletion is on hold")).data!.length).toBe(1);
    await db.from("profiles").update({ deletion_requested_at: null }).eq("id", owner.id);
    await db.from("workspaces").delete().eq("id", ws);
  });
});
