import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login, seedWorkspace, signedIn } from "../phase1/helpers";

// Media Studio: permissions, optimistic concurrency, versions, template publishing/stripping, community moderation, editor UI.
const db = admin as unknown as SupabaseClient;
const doc = (text = "Hello", extra: object[] = []) => ({ unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1080, background: { type: "solid", color: "#ffffff" },
  layers: [{ id: "t1", name: "Heading", type: "text", text, font: "Inter", size: 80, weight: 800, color: "#000000", align: "center", lineHeight: 1.1, letterSpacing: 0, x: 100, y: 100, w: 880, h: 200, rotation: 0 }, ...extra] }] });

test.describe("media studio", () => {
  let a: { id: string; email: string }, b: { id: string; email: string }, c: { id: string; email: string }, d: { id: string; email: string }, wsA: string, wsB: string, ev: string;
  const ids: string[] = [];
  test.beforeAll(async () => {
    [a, b, c, d] = await Promise.all([createUser("md-a"), createUser("md-b"), createUser("md-c"), createUser("md-d")]);
    [wsA, wsB] = await Promise.all([seedWorkspace(a.id, "organizer", "Media A"), seedWorkspace(b.id, "organizer", "Media B")]);
    ev = ((await db.from("events").insert({ owner_id: a.id, workspace_id: wsA, name: "Studio Launch Night", venue_name: "The Hall" }).select("id").single()).data as { id: string }).id;
  });
  test.afterAll(async () => {
    await db.from("design_templates").delete().in("owner_id", [a.id, b.id]);
    await db.from("designs").delete().in("workspace_id", [wsA, wsB]);
    await db.from("designs").delete().in("owner_id", [a.id, b.id]);
    await db.from("events").delete().eq("id", ev);
    await db.from("workspaces").delete().in("id", [wsA, wsB]);
    await cleanup();
  });

  test("workspace isolation, optimistic concurrency and versions", async () => {
    const ca = await signedIn(a.email) as unknown as SupabaseClient, cb = await signedIn(b.email) as unknown as SupabaseClient;
    const { data: id, error } = await ca.rpc("create_design", { p_workspace: wsA, p_event: ev, p_title: "Poster", p_document: doc() });
    expect(error).toBeNull(); ids.push(id as string);
    // B can't create in A's workspace, can't read or save A's design.
    expect((await cb.rpc("create_design", { p_workspace: wsA, p_event: null, p_title: "x", p_document: doc() })).error?.message).toMatch(/not_authorized/);
    expect((await cb.from("designs").select("id").eq("id", id)).data).toEqual([]);
    expect((await cb.rpc("save_design", { p_design: id, p_document: doc("hack"), p_expected_version: 1 })).error).not.toBeNull();
    // Saves bump the version; a stale version is rejected.
    const v2 = (await ca.rpc("save_design", { p_design: id, p_document: doc("v2"), p_expected_version: 1, p_label: "Named" })).data;
    expect(v2).toBe(2);
    expect((await ca.rpc("save_design", { p_design: id, p_document: doc("stale"), p_expected_version: 1 })).error?.message).toMatch(/version_conflict/);
    // Restore brings back v1's content and keeps history.
    expect((await ca.rpc("restore_design_version", { p_design: id, p_version: 1 })).error).toBeNull();
    const { data: after } = await ca.from("designs").select("document,version").eq("id", id).single();
    expect(JSON.stringify(after!.document)).toContain("Hello");
    expect((await ca.from("design_versions").select("version").eq("design_id", id)).data!.length).toBeGreaterThanOrEqual(3);
  });

  test("publishing strips event bindings and private images; private templates stay private", async () => {
    const ca = await signedIn(a.email) as unknown as SupabaseClient, cb = await signedIn(b.email) as unknown as SupabaseClient;
    const bound = { id: "t2", name: "Name", type: "text", text: "Studio Launch Night", bind: "event.name", font: "Inter", size: 40, weight: 700, color: "#000", align: "center", lineHeight: 1, letterSpacing: 0, x: 0, y: 400, w: 1080, h: 80, rotation: 0 };
    const img = { id: "i1", name: "Private", type: "image", asset: { src: "/api/media/asset?path=x", path: `${a.id}/secret.png` }, fit: "cover", focusX: 50, focusY: 50, zoom: 1, x: 0, y: 0, w: 100, h: 100, rotation: 0 };
    const { data: id } = await ca.rpc("create_design", { p_workspace: wsA, p_event: ev, p_title: "Tpl", p_document: doc("Hi", [bound, img]) });
    const { data: pub, error } = await ca.rpc("publish_template", { p_design: id, p_title: "Launch template", p_description: "", p_category: "nightclub", p_tags: ["club"], p_visibility: "public" });
    expect(error).toBeNull();
    const { data: t } = await cb.from("design_templates").select("document,placeholders").eq("id", pub).single();
    const s = JSON.stringify(t!.document);
    expect(s).toContain("{{event.name}}"); expect(s).not.toContain("Studio Launch Night"); expect(s).not.toContain("secret.png");
    expect(t!.placeholders).toContain("event.name");
    // B gets an independent copy of the public template.
    const copy = await cb.rpc("create_design", { p_workspace: wsB, p_event: null, p_title: "Mine", p_document: doc(), p_source: "template", p_template: pub });
    expect(copy.error).toBeNull();
    // A personal (no-workspace) private template is invisible and unusable to others.
    const { data: personal } = await ca.rpc("create_design", { p_workspace: null, p_event: null, p_title: "Personal", p_document: doc("mine") });
    const { data: priv } = await ca.rpc("publish_template", { p_design: personal, p_title: "Private one", p_description: "", p_category: "menu", p_tags: [], p_visibility: "private" });
    expect((await cb.from("design_templates").select("id").eq("id", priv)).data).toEqual([]);
    expect((await cb.rpc("create_design", { p_workspace: wsB, p_event: null, p_title: "x", p_document: doc(), p_source: "template", p_template: priv })).error?.message).toMatch(/template_not_found/);
    // Three independent reports hide a public template pending review.
    for (const u of [b, c, d]) { const cl = await signedIn(u.email) as unknown as SupabaseClient; await cl.rpc("report_template", { p_template: pub, p_reason: "spam", p_detail: "" }); }
    expect((await db.from("design_templates").select("status").eq("id", pub).single()).data!.status).toBe("hidden");
  });

  test("editor loads, edits and autosaves", async ({ page }) => {
    const ca = await signedIn(a.email) as unknown as SupabaseClient;
    const { data: id } = await ca.rpc("create_design", { p_workspace: wsA, p_event: ev, p_title: "UI design", p_document: doc("Edit me") });
    await login(page, a.email, `/studio/${id}`);
    await expect(page.getByLabel("Design name")).toHaveValue("UI design", { timeout: 30_000 });
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.getByRole("button", { name: "Add a heading" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 15_000 });
    const { data: saved } = await ca.from("designs").select("document,version").eq("id", id).single();
    expect(saved!.version).toBeGreaterThan(1);
    expect(JSON.stringify(saved!.document)).toContain("Add a heading");
    // Library lists it.
    await page.goto(`${BASE}/organizer/media`);
    await expect(page.getByText("UI design")).toBeVisible();
  });
  test("agent drafts an event poster as the human, never for another workspace", async () => {
    const r = await db.rpc("agent_invoke", { p_actor: a.id, p_workspace: wsA, p_tool: "media.event_poster", p_args: { event_id: ev, document: doc("{{event.name}}"), title: "Agent poster" } });
    expect(r.error).toBeNull();
    const out = r.data as { design_id: string; link: string };
    const { data: dd } = await db.from("designs").select("source,owner_id,status,workspace_id").eq("id", out.design_id).single();
    expect(dd).toMatchObject({ source: "agent", owner_id: a.id, status: "draft", workspace_id: wsA });
    const list = (await db.rpc("agent_invoke", { p_actor: a.id, p_workspace: wsA, p_tool: "media.list_designs", p_args: { event_id: ev } })).data as { id: string }[];
    expect(list.some(x => x.id === out.design_id)).toBe(true);
    // B's agent can't draft against A's event.
    expect((await db.rpc("agent_invoke", { p_actor: b.id, p_workspace: wsB, p_tool: "media.event_poster", p_args: { event_id: ev, document: doc() } })).error).not.toBeNull();
  });
});
