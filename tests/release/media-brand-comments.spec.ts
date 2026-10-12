import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login, seedWorkspace, signedIn } from "../phase1/helpers";

// Media Studio brand kit, custom fonts and design comments (media spec §34–35, §44, §46).
const db = admin as unknown as SupabaseClient;
const doc = { unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1080, background: { type: "solid", color: "#ffffff" },
  layers: [{ id: "t1", name: "Heading", type: "text", text: "Hello", font: "Inter", size: 80, weight: 800, color: "#000000", align: "center", lineHeight: 1.1, letterSpacing: 0, x: 100, y: 100, w: 880, h: 200, rotation: 0 }] }] };
// Smallest thing that passes the signature check: a WOFF2 header followed by padding (the browser won't render it, which is fine here).
const signIn = async (page: import("@playwright/test").Page, email: string) => { await login(page, email, "/account"); await page.waitForURL(/\/account/, { timeout: 30_000 }); };
const fakeWoff2 = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(60, 1)]);

test.describe("media brand kit, fonts and comments", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string }, stranger: { id: string; email: string }, ws: string, design: string;
  test.beforeAll(async () => {
    [owner, member, stranger] = await Promise.all([createUser("mbc-o"), createUser("mbc-m"), createUser("mbc-s")]);
    ws = await seedWorkspace(owner.id, "organizer", "Brand Co");
    await db.from("workspace_members").upsert({ workspace_id: ws, user_id: member.id, role: "member", status: "active" }, { onConflict: "workspace_id,user_id" });
    const co = await signedIn(owner.email) as unknown as SupabaseClient;
    design = (await co.rpc("create_design", { p_workspace: ws, p_event: null, p_title: "Brand poster", p_document: doc })).data as string;
  });
  test.afterAll(async () => {
    const { data: fonts } = await db.from("uploaded_fonts").select("path").eq("workspace_id", ws);
    if (fonts?.length) await db.storage.from("workspace-files").remove(fonts.map(f => f.path as string));
    await db.from("uploaded_fonts").delete().eq("workspace_id", ws);
    await db.from("brand_kits").delete().eq("workspace_id", ws);
    await db.from("notifications").delete().in("user_id", [owner.id, member.id]).eq("kind", "design_comment");
    await db.from("designs").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("brand kit: owners save, members read only, values validated, strangers see nothing", async () => {
    const [co, cm, cs] = await Promise.all([signedIn(owner.email), signedIn(member.email), signedIn(stranger.email)]) as unknown as SupabaseClient[];
    const kit = { p_workspace: ws, p_colors: [{ hex: "#0b08f8", name: "Dock blue" }, { hex: "#ff3cac" }], p_fonts: [{ family: "Poppins", role: "heading" }], p_logos: [] };
    expect((await co!.rpc("save_brand_kit", kit)).error).toBeNull();
    expect((await cm!.from("brand_kits").select("colors").eq("workspace_id", ws).single()).data?.colors).toHaveLength(2);
    expect((await cm!.rpc("save_brand_kit", { ...kit, p_colors: [] })).error?.message).toMatch(/not_authorized/);
    expect((await co!.rpc("save_brand_kit", { ...kit, p_colors: [{ hex: "red" }] })).error?.message).toMatch(/invalid_colors/);
    expect((await co!.rpc("save_brand_kit", { ...kit, p_logos: [{ path: "../../etc/passwd" }] })).error?.message).toMatch(/invalid_logos/);
    expect((await cs!.from("brand_kits").select("colors").eq("workspace_id", ws)).data).toEqual([]);
  });

  test("custom fonts: signature checked, licence required, members can download, strangers can't", async ({ browser }) => {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await signIn(page, owner.email);
    const post = (extra: Record<string, string>, file = fakeWoff2, name = "acme.woff2") => page.request.post(`${BASE}/api/media/font`, {
      headers: { Origin: BASE }, multipart: { file: { name, mimeType: "font/woff2", buffer: file }, workspaceId: ws, family: "Acme Display", weight: "700", style: "normal", ...extra } });
    expect((await post({})).status()).toBe(400);                                                          // no licence acknowledgement
    expect((await post({ licence: "yes" }, Buffer.from("<script>alert(1)</script>"), "evil.woff2")).status()).toBe(415);   // not a font
    const ok = await post({ licence: "yes" });
    expect(ok.status()).toBe(200);
    const font = await ok.json() as { id: string; family: string };
    expect(font.family).toBe("Acme Display");
    const got = await page.request.get(`${BASE}/api/media/font?id=${font.id}`);
    expect(got.status()).toBe(200);
    expect(got.headers()["content-type"]).toBe("font/woff2");
    expect(Buffer.from(await got.body()).subarray(0, 4).toString()).toBe("wOF2");
    await ctx.close();
    // A member of the workspace can fetch it; a stranger can't; a member can't delete it.
    const mctx = await browser.newContext(); const mp = await mctx.newPage(); await signIn(mp, member.email);
    expect((await mp.request.get(`${BASE}/api/media/font?id=${font.id}`)).status()).toBe(200);
    expect((await mp.request.delete(`${BASE}/api/media/font?id=${font.id}`, { headers: { Origin: BASE } })).status()).toBe(403);
    await mctx.close();
    const sctx = await browser.newContext(); const sp = await sctx.newPage(); await signIn(sp, stranger.email);
    expect((await sp.request.get(`${BASE}/api/media/font?id=${font.id}`)).status()).toBe(404);
    await sctx.close();
  });

  test("comments: members comment and reply, owner is notified, only the author deletes, strangers are refused", async () => {
    const [co, cm, cs] = await Promise.all([signedIn(owner.email), signedIn(member.email), signedIn(stranger.email)]) as unknown as SupabaseClient[];
    const c1 = await cm!.rpc("add_design_comment", { p_design: design, p_body: "Make the heading bigger", p_page: "p1", p_layer: "t1" });
    expect(c1.error).toBeNull();
    const { data: n } = await db.from("notifications").select("title,link").eq("user_id", owner.id).eq("kind", "design_comment");
    expect(n?.[0]?.title).toMatch(/commented on Brand poster/);
    expect(n?.[0]?.link).toBe(`/studio/${design}?comments=1`);
    const reply = await co!.rpc("add_design_comment", { p_design: design, p_body: "Done", p_parent: c1.data });
    expect(reply.error).toBeNull();
    expect((await db.from("notifications").select("id").eq("user_id", member.id).eq("kind", "design_comment")).data).toHaveLength(1);   // thread starter told about the reply
    expect((await cs!.rpc("add_design_comment", { p_design: design, p_body: "spam" })).error?.message).toMatch(/not_authorized/);
    expect((await cs!.from("design_comments").select("id").eq("design_id", design)).data).toEqual([]);
    expect((await co!.rpc("delete_design_comment", { p_comment: c1.data })).error?.message).toMatch(/not_authorized/);
    expect((await co!.rpc("resolve_design_comment", { p_comment: c1.data, p_resolved: true })).error).toBeNull();
    expect((await db.from("design_comments").select("resolved").eq("design_id", design)).data?.every(r => r.resolved)).toBe(true);   // reply resolved with its thread
    expect((await cm!.rpc("delete_design_comment", { p_comment: c1.data })).error).toBeNull();
    expect((await db.from("design_comments").select("id").eq("design_id", design)).data).toEqual([]);
  });

  test("studio UI: brand colour applies, comments panel posts and lists", async ({ page }) => {
    await db.from("brand_kits").upsert({ workspace_id: ws, colors: [{ hex: "#0b08f8", name: "Dock blue" }], fonts: [], logos: [] });
    await login(page, owner.email, `/studio/${design}`);
    await expect(page.getByLabel("Design name")).toHaveValue("Brand poster", { timeout: 30_000 });
    await page.getByRole("button", { name: "Brand", exact: true }).click();
    await page.getByRole("button", { name: "Apply Dock blue" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 15_000 });
    const { data: saved } = await db.from("designs").select("document").eq("id", design).single();
    expect((saved!.document as typeof doc).pages[0]!.background).toEqual({ type: "solid", color: "#0b08f8" });
    await page.getByRole("button", { name: /^Comments/ }).click();
    const dialog = page.getByRole("dialog", { name: "Comments" });
    await dialog.getByLabel("Add a comment").fill("Looks great on the blue");
    await dialog.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(dialog.getByText("Looks great on the blue")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Comments\s*1$/ })).toBeVisible();
  });
});
