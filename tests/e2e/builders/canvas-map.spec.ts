import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, login, insertEventFixture } from "../../phase1/helpers";
import { planSeats } from "../../../src/components/venue-plan/inventory";
import type { MapEl } from "../../../src/app/provider/venues/_components/venue-map";

/**
 * Canvas + map builder round trips (owner "check the canvas and the map builder", 2026-11-11):
 *  1. organiser map: import → save draft → publish (UI) → event_seats synced → public render (touch-scrollable, text list) →
 *     checkout seat availability (held seat unavailable, keyboard seat list selects) — Stripe never reached; finance role is view-only.
 *  2. Media Studio: text layer edit → autosave → reload keeps the edit → PNG export.
 *  3. Customer build canvas: add a provider from the Add tile dialog → build_items row → remove → gone.
 * Disposable p1- users/workspaces/events only (cleanup() + explicit deletes). Run with E2E_AUTH_FIXTURE=otp (no Turnstile).
 */
const db = admin as unknown as SupabaseClient;
const hex = () => randomBytes(3).toString("hex");

test.describe.serial("map builder → publish → public render → checkout seats", () => {
  let owner: { id: string; email: string }, finance: { id: string; email: string }, ws: string, event: string, slug: string, tier: string;
  const overlay: MapEl[] = [];
  test.beforeAll(async () => {
    [owner, finance] = await Promise.all([createUser("cm-map-owner"), createUser("cm-map-finance")]);
    ws = await seedWorkspace(owner.id, "organizer", "Canvas map builder");
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: finance.id, role: "finance", status: "active" });
    slug = `p1-canvas-map-${hex()}`;
    const ev = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "Canvas map round trip", slug, management: "professional", status: "on_sale", visibility: "public",
      starts_at: new Date(Date.now() + 30 * 864e5).toISOString(), capacity: 6, venue_name: "Fixture Hall", city: "London" }, "canvas-map round trip");
    if (ev.error) throw ev.error; event = (Array.isArray(ev.data) ? ev.data[0] : ev.data).id as string; // service_insert_event returns the row set
    const t = await db.from("ticket_tiers").insert({ event_id: event, name: "Stalls", quantity: 6, price: 25, status: "on_sale" }).select("id").single();
    if (t.error) throw t.error; tier = t.data.id;
    overlay.push({ type: "asset", asset: "seat_block", id: "blk-fixture", label: "Block A", x: 40, y: 40, w: 20, h: 14, tier,
      seating: { rows: 2, cols: 3, rowStyle: "alpha", colStyle: "numeric", rowStart: 1, colStart: 1, skipIO: true, rowDir: "front", colDir: "ltr", aisles: [], pitch: 5, prefix: "A" } } as MapEl);
  });
  test.afterAll(async () => { if (event) await db.from("events").delete().eq("id", event); if (ws) await db.from("workspaces").delete().eq("id", ws); await cleanup(); });

  test("import, save draft, publish from the editor; inventory syncs", async ({ page }) => {
    await login(page, owner.email, `/organizer/events/${event}/map`);
    await expect(page.getByRole("application", { name: "Plan editor" })).toBeVisible();
    await page.getByRole("button", { name: "Export or import", exact: true }).click();
    const chooser = page.waitForEvent("filechooser"); await page.getByRole("menuitem", { name: "Import plan file…", exact: true }).click();
    await (await chooser).setFiles({ name: "canvas-map.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "gala-plan", version: 1, mode: "event", elements: overlay })) });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(async () => (await db.from("venue_maps").select("status").eq("event_id", event).order("version", { ascending: false }).limit(1).maybeSingle()).data?.status).toBe("draft");
    await page.reload(); await expect(page.locator(".mb-svg")).toContainText(/Block A/i); // block names draw in capitals
    await page.getByRole("button", { name: "Publish map", exact: true }).click();
    await page.getByRole("dialog", { name: "Publish layout" }).getByRole("button", { name: "Publish", exact: true }).press("Enter");
    await expect.poll(async () => (await db.from("event_seats").select("seat_key").eq("event_id", event)).data?.length ?? 0).toBe(planSeats(overlay).length);
    // JSON export round-trips the saved elements exactly.
    await page.getByRole("button", { name: "Export or import", exact: true }).click();
    const dl = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "Export plan file (.json)", exact: true }).click();
    const file = await (await dl).path(); expect(JSON.parse(await readFile(file!, "utf8")).elements).toEqual(overlay);
  });

  test("public event page renders the published plan with a text list and native touch scrolling", async ({ page }) => {
    await page.goto(`/events/${slug}`);
    const plan = page.locator(".pp").first();
    await expect(plan.getByRole("heading", { name: "Areas on this map" })).toBeVisible();
    await expect(plan.locator(".pp-list")).toContainText("Block A");
    await expect(plan.locator(".pp-list")).toContainText("6 seats");
    // Read-only renders must not swallow touch scrolling (editors keep touch-action:none on their own SVGs).
    expect(await plan.locator("svg.vm").first().evaluate(el => getComputedStyle(el).touchAction)).toBe("auto");
    // The public render is server-rendered: no plan editor on the page.
    await expect(page.getByRole("application", { name: "Plan editor" })).toHaveCount(0);
  });

  test("checkout: held seat is unavailable; keyboard seat list selects an available seat", async ({ page }) => {
    const keys = planSeats(overlay).map(s => s.key), token = randomBytes(24).toString("hex");
    const held = await (anon() as unknown as SupabaseClient).rpc("hold_seats", { p_event: event, p_keys: [keys[0]], p_token: token });
    expect(held.error).toBeNull();
    expect((await db.from("event_seats").select("status").eq("event_id", event).eq("seat_key", keys[0]).single()).data?.status).toBe("held");
    await page.goto(`/checkout/${event}`);
    await expect(page.getByRole("application", { name: /Seating plan/ })).toBeVisible();
    // The picker is server-rendered then hydrated (dynamic import): retry the toggle until React owns it.
    const toggle = page.locator(".sp-list-toggle");
    await expect(async () => { if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 }); }).toPass({ timeout: 30_000 });
    const list = page.locator(".sp-list-body");
    await expect(list.getByRole("button", { name: /unavailable|sold/ })).toHaveCount(1);
    const first = list.getByRole("button", { name: /£25/ }).filter({ hasNotText: /unavailable|sold/ }).first();
    await first.focus(); await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".sp-sum")).toContainText("1 of 10 seat");
  });

  test("finance role sees the layout read-only (server also refuses saves)", async ({ page }) => {
    await login(page, finance.email, `/organizer/events/${event}/map`);
    await expect(page.getByText(/View only/)).toBeVisible();
    await expect(page.getByRole("application", { name: "Plan editor" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish map" })).toHaveCount(0);
    const c = await signedIn(finance.email) as unknown as SupabaseClient;
    const r = await c.rpc("event_map_save", { p_event: event, p_overlay: [], p_seats: [], p_publish: false, p_base_version: 0 });
    expect(r.error?.message ?? "").toMatch(/not_authorized|stale_version/);
  });
});

test.describe.serial("media studio canvas: edit → save → reload → export", () => {
  let user: { id: string; email: string }, ws: string, id: string;
  const doc = { unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1080, background: { type: "solid", color: "#ffffff" },
    layers: [{ id: "t1", name: "Heading", type: "text", text: "Edit me", font: "Inter", size: 80, weight: 800, color: "#000000", align: "center", lineHeight: 1.1, letterSpacing: 0, x: 100, y: 100, w: 880, h: 200, rotation: 0 }] }] };
  test.beforeAll(async () => {
    user = await createUser("cm-studio"); ws = await seedWorkspace(user.id, "organizer", "Canvas studio");
    const c = await signedIn(user.email) as unknown as SupabaseClient;
    const r = await c.rpc("create_design", { p_workspace: ws, p_event: null, p_title: `p1 studio ${hex()}`, p_document: doc });
    if (r.error) throw r.error; id = r.data as string;
  });
  test.afterAll(async () => { await db.from("designs").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); await cleanup(); });

  test("text layer edit persists across reload and exports as PNG", async ({ page }) => {
    const v0 = (await db.from("designs").select("version").eq("id", id).single()).data?.version as number;
    await login(page, user.email, `/studio/${id}`);
    await expect(page.locator(".st-page").first()).toContainText("Edit me");
    // Select the text layer from the Layers panel (keyboard/pointer-neutral), then edit it in Properties.
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    await page.locator(".st-layers .st-lname").filter({ hasText: "Heading" }).first().click();
    const props = page.getByRole("button", { name: "Properties" });
    if (await props.isVisible().catch(() => false)) await props.click();
    await page.getByRole("textbox", { name: "Text", exact: true }).fill("Neon headline");
    await expect.poll(async () => (await db.from("designs").select("version").eq("id", id).single()).data?.version as number, { timeout: 20_000 }).toBeGreaterThan(v0);
    await expect(page.locator(".st-save")).toHaveText("Saved", { timeout: 15_000 });
    await page.reload();
    await expect(page.locator(".st-page").first()).toContainText("Neon headline");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "Export", exact: true });
    await dlg.getByRole("combobox", { name: /Format/ }).selectOption("png");
    const [download] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: "Download", exact: true }).click()]);
    const png = await readFile((await download.path())!);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
  });
});

test.describe.serial("customer build canvas: add and remove", () => {
  let user: { id: string; email: string }, event: string;
  test.beforeAll(async () => {
    user = await createUser("cm-build");
    const r = await db.from("events").insert({ name: `p1 build canvas ${hex()}`, owner_id: user.id, management: "consumer", status: "draft", event_type: "birthday", visibility: "private",
      guest_count: 80, city: "London", location: "London, UK", starts_at: new Date(Date.now() + 60 * 864e5).toISOString(), ends_at: new Date(Date.now() + 60 * 864e5 + 4 * 36e5).toISOString() }).select("id").single();
    if (r.error) throw r.error; event = r.data.id as string;
  });
  test.afterAll(async () => { if (event) { await db.from("build_items").delete().eq("event_id", event); await db.from("events").delete().eq("id", event); } await cleanup(); });

  test("add a provider from the Add tile, then remove it", async ({ page }) => {
    await login(page, user.email, `/account/events/${event}/build`);
    const tiles = page.locator(".cb-add-tile"); await tiles.first().waitFor({ timeout: 60_000 });
    let title = "";
    // The canvas shows one Add tile per open category; the dialog's Category select reaches every category, so walk it until one offers a provider.
    await tiles.first().click();
    const dlg = page.getByRole("dialog"), cat = dlg.getByRole("combobox", { name: "Category" });
    const values = await cat.locator("option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value));
    for (const v of values) {
      await cat.selectOption(v);
      const add = dlg.getByRole("button", { name: /^(Add|Add anyway)$/ });
      if (!(await add.first().waitFor({ timeout: 15_000 }).then(() => true, () => false))) continue;
      title = (await add.first().locator("xpath=ancestor::article[1]").locator("h3").innerText()).trim();
      await add.first().click();
      await expect(dlg.getByRole("button", { name: "Added" }).first()).toBeVisible();
      break;
    }
    if (title) await dlg.getByRole("button", { name: "Done" }).click(); else await dlg.getByRole("button", { name: "Close" }).click();
    expect(title, "no marketplace provider was offered for any category").not.toBe("");
    await expect.poll(async () => (await db.from("build_items").select("id").eq("event_id", event).eq("status", "suggested")).data?.length ?? 0).toBe(1);
    await page.reload();
    await page.getByRole("button", { name: `Options for ${title}` }).first().click();
    await page.getByRole("menuitem", { name: /Remove option/ }).click();
    await expect.poll(async () => (await db.from("build_items").select("id").eq("event_id", event).neq("status", "cancelled")).data?.length ?? 0).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
});
