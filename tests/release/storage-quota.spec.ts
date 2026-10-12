import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Release spec §115: storage is attributed per workspace and uploads stop past the plan allowance (+10% grace), at the database.
const db = admin as unknown as SupabaseClient;
const png = (bytes: number) => { const b = Buffer.alloc(bytes); Buffer.from("89504e470d0a1a0a", "hex").copy(b); return b; };

test.describe("storage quotas", () => {
  let u: { id: string; email: string }, ws: string;
  const uploaded: string[] = [];
  test.beforeAll(async () => {
    u = await createUser("quota");
    ws = await seedWorkspace(u.id, "organizer", "Quota Org");
    // ~2 KB allowance via a per-workspace entitlement override.
    await db.from("workspaces").update({ settings: { entitlements: { "storage.gb": 0.000002 } } }).eq("id", ws);
  });
  test.afterAll(async () => {
    if (uploaded.length) await db.storage.from("event-media").remove(uploaded);
    await db.from("workspaces").delete().eq("id", ws); await cleanup();
  });

  test("usage is attributed to the workspace and uploads stop past the allowance", async () => {
    const c = await signedIn(u.email) as unknown as SupabaseClient;
    const p1 = `${ws}/q1-${Date.now()}.png`;
    const up1 = await c.storage.from("event-media").upload(p1, png(1800), { contentType: "image/png" });
    expect(up1.error).toBeNull(); uploaded.push(p1);
    const usage = (await c.rpc("my_storage_usage", { p_workspace: ws })).data as { bytes: number; files: number; limit_bytes: number; pct: number };
    expect(usage.files).toBe(1); expect(usage.bytes).toBeGreaterThanOrEqual(1500);
    // A second 1.5 KB file would exceed 2 KB + 10% grace → refused.
    const p2 = `${ws}/q2-${Date.now()}.png`;
    const up2 = await c.storage.from("event-media").upload(p2, png(1500), { contentType: "image/png" });
    if (!up2.error) uploaded.push(p2);
    expect(up2.error).not.toBeNull(); expect(up2.error?.message).toMatch(/P0001|quota/);  // storage surfaces the trigger as P0001 → routes map it to a clear 413
    // Deleting frees the allowance.
    // Members can delete their own workspace's event images (needs the select policy added in 202610270024).
    const rm = await c.storage.from("event-media").remove([p1]); expect(rm.error).toBeNull(); expect(rm.data?.length).toBe(1); uploaded.splice(uploaded.indexOf(p1), 1);
    expect((await db.from("storage_attribution").select("name").eq("name", p1)).data).toEqual([]);   // attribution follows deletes
    expect(((await c.rpc("my_storage_usage", { p_workspace: ws })).data as { files: number }).files).toBe(0);
    const p3 = `${ws}/q3-${Date.now()}.png`;
    expect((await c.storage.from("event-media").upload(p3, png(1500), { contentType: "image/png" })).error).toBeNull(); uploaded.push(p3);
    // Outsiders can't read another workspace's (or person's) usage.
    const stranger = await signedIn((await createUser("quota-x")).email) as unknown as SupabaseClient;
    expect((await stranger.rpc("storage_usage", { p_workspace: ws, p_user: null })).error?.message).toMatch(/forbidden/);
    expect((await stranger.rpc("storage_usage", { p_workspace: null, p_user: u.id })).error?.message).toMatch(/forbidden/);
    expect((await stranger.rpc("my_storage_usage", { p_workspace: ws })).error).not.toBeNull();
    // ...and can't delete another workspace's images.
    expect((await stranger.storage.from("event-media").remove([p3])).data ?? []).toEqual([]);
    expect((await c.rpc("storage_usage", { p_workspace: ws, p_user: null })).error).toBeNull();   // members still can
    // Owners were warned when crossing 80% / 100%.
    const { data: n } = await db.from("notifications").select("title").eq("user_id", u.id).like("title", "Storage %");
    expect((n ?? []).length).toBeGreaterThan(0);
  });
});
