import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, login, insertEventFixture } from "../phase1/helpers";
import { planSeats } from "../../src/components/venue-plan/inventory";
import type { MapEl } from "../../src/app/provider/venues/_components/venue-map";

const db = admin as unknown as SupabaseClient;
test.describe.serial("PWA event-map persistence and ticketing", () => {
  let owner: { id: string; email: string }, other: { id: string; email: string }, ws: string, event: string, tier: string, client: SupabaseClient;
  const overlay: MapEl[] = [];
  test.beforeAll(async () => {
    owner = await createUser("map-flow-owner"); other = await createUser("map-flow-other");
    ws = await seedWorkspace(owner.id, "organizer", "Isolated map workflow");
    const ev = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "Isolated map workflow", management: "professional", status: "on_sale", visibility: "public", starts_at: new Date(Date.now() + 30 * 864e5).toISOString(), capacity: 6 }, "pwa-event-map-workflows").select("id").single();
    if (ev.error) throw ev.error; event = ev.data.id;
    const t = await db.from("ticket_tiers").insert({ event_id: event, name: "Reserved table", quantity: 6, price: 20, status: "on_sale" }).select("id").single();
    if (t.error) throw t.error; tier = t.data.id;
    overlay.push({ type: "asset", asset: "round_table", label: "Fixture table", x: 50, y: 50, w: 28, h: 28, tier, table: { shape: "round", seats: 6, number: "1", seatStyle: "numeric" } });
    client = await signedIn(owner.email) as unknown as SupabaseClient;
  });
  test.afterAll(async () => { if (event) await db.from("events").delete().eq("id", event); if (ws) await db.from("workspaces").delete().eq("id", ws); await cleanup(); });
  const save = (elements: MapEl[], publish: boolean) => client.rpc("organizer_save_event_plan", { p_event: event, p_structure: { format: "plan-v2" }, p_overlay: elements, p_seats: planSeats(elements), p_publish: publish });

  test("mobile import, draft save, reload, publish and JSON/SVG export use the actual event plan", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await login(page, owner.email, `/organizer/events/${event}/map`);
    await expect(page.getByRole("application", { name: "Plan editor" })).toBeVisible();
    await page.getByRole("button", { name: "Export or import", exact: true }).click();
    const chooser = page.waitForEvent("filechooser"); await page.getByRole("menuitem", { name: "Import plan file…", exact: true }).click();
    await (await chooser).setFiles({ name: "isolated-plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "gala-plan", version: 1, mode: "event", elements: overlay })) });
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled(); await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(async () => (await db.from("venue_maps").select("status").eq("event_id", event).order("version", { ascending: false }).limit(1).single()).data?.status).toBe("draft");
    expect((await db.from("event_seats").select("seat_key").eq("event_id", event)).data).toEqual([]);
    await page.reload(); await expect(page.locator(".mb-svg")).toContainText("Table 1 · Seat 1");
    // The event map editor's toolbar button is "Publish map" (editor.tsx, checkpoint 5d81a06); the dialog's confirm stays "Publish".
    await page.getByRole("button", { name: "Publish map", exact: true }).click();
    // At 390px the confirm sits under the Next.js dev-tools badge (dev only), which swallows pointer clicks: confirm by keyboard.
    await page.getByRole("dialog", { name: "Publish layout" }).getByRole("button", { name: "Publish", exact: true }).press("Enter");
    await expect.poll(async () => (await db.from("event_seats").select("seat_key").eq("event_id", event)).data?.length).toBe(6);
    // The overhauled editor shows capacity in the "Capacity" KPI list (the old .ep-head summary is gone).
    await page.reload(); await expect(page.getByRole("definition").filter({ hasText: /^6/ }).first()).toBeVisible(); await expect(page.locator(".om-kpis")).toContainText("6");
    for (const [name, extension] of [["Export plan file (.json)", "json"], ["Export SVG (vector)", "svg"]]) {
      await page.getByRole("button", { name: "Export or import", exact: true }).click();
      const pending = page.waitForEvent("download"); await page.getByRole("menuitem", { name, exact: true }).click(); const download = await pending;
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`)); const file = await download.path(); expect(file).toBeTruthy();
      const body = await readFile(file!, "utf8"); if (extension === "json") expect(JSON.parse(body).elements).toEqual(overlay); else { expect(body).toContain("<svg"); expect(body).toContain("Table 1 · Seat 1"); }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test("six buyers cannot double-hold one seat; publishing cannot remove held inventory; strangers cannot save", async () => {
    const strangers = await signedIn(other.email) as unknown as SupabaseClient;
    expect((await strangers.rpc("organizer_save_event_plan", { p_event: event, p_structure: {}, p_overlay: [], p_seats: [], p_publish: true })).error?.message).toContain("not_authorized");
    const tokens = Array.from({ length: 6 }, () => randomBytes(24).toString("hex")); const publicClient = anon() as unknown as SupabaseClient;
    try {
      const holds = await Promise.all(tokens.map(p_token => publicClient.rpc("hold_seats", { p_event: event, p_keys: ["T1-1"], p_token })));
      expect(holds.filter(result => !result.error)).toHaveLength(1); expect(holds.filter(result => result.error)).toHaveLength(5);
      expect((await db.from("ticket_tiers").select("held").eq("id", tier).single()).data?.held).toBe(1);
      expect((await save([], true)).error?.message).toContain("seats_in_use");
      expect((await db.from("event_seats").select("seat_key").eq("event_id", event)).data).toHaveLength(6);
    } finally { for (const p_token of tokens) await publicClient.rpc("release_seat_holds", { p_token }); }
    expect((await db.from("ticket_tiers").select("held").eq("id", tier).single()).data?.held).toBe(0);
  });

  test("concurrent draft saves allocate unique increasing history versions", async () => {
    const before = (await db.from("venue_maps").select("version").eq("event_id", event).order("version", { ascending: false }).limit(1).single()).data?.version ?? 0;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => save(overlay.map(el => ({ ...el, label: `Concurrent draft ${i}` })), false)));
    expect(results.map(result => result.error)).toEqual(Array(12).fill(null));
    const versions = results.map(result => result.data as number).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: 12 }, (_, i) => before + i + 1));
  });
});
