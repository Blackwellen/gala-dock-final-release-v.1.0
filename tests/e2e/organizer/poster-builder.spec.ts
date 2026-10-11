import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// ORG-015: the poster renders from event data, edits redraw it, PNG export downloads and "Save to library" stores a media asset.
let eventId = ""; const started = new Date().toISOString();
test.beforeAll(async () => { const { data } = await admin().from("events").select("id").eq("name", "Neon Nights Festival").is("settings->>demo_copy_of", null).limit(1).single(); eventId = data!.id; });
test.afterAll(async () => {
  const db = admin(); const { data } = await db.from("media_assets").select("id,url").eq("event_id", eventId).gte("created_at", started);
  for (const m of data ?? []) { const path = m.url.split("/event-media/")[1]; if (path) await db.storage.from("event-media").remove([path]); await db.from("media_assets").delete().eq("id", m.id); }
});

test("design, export and save a poster", async ({ page }) => {
  await login(page, "organizer", `/organizer/events/${eventId}/media`);
  await page.goto(`/organizer/events/${eventId}/media`, { waitUntil: "load" });
  const canvas = page.locator(".pb-sel canvas");
  await expect(canvas).toHaveJSProperty("width", 1240);
  await expect(page.locator(".pb-tpls img")).toHaveCount(10, { timeout: 30_000 });

  await page.getByRole("button", { name: /^Square/ }).first().click();
  await expect(canvas).toHaveJSProperty("height", 1080);
  await page.getByLabel(/Headline \/ Tagline/).fill("Lights • Bass • Summer");
  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByRole("button", { name: "Modern" }).click();
  await page.getByRole("tab", { name: "Event Details" }).click();
  await page.getByRole("button", { name: "Undo" }).click();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export selected" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/neon-nights-festival-square\.png$/);

  // Keep the demo event untouched: save to the library only.
  await page.getByLabel("Attach to event page gallery").uncheck();
  await page.getByLabel("Use in promotion campaigns").uncheck();
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect.poll(async () => (await admin().from("media_assets").select("format,url").eq("event_id", eventId).gte("created_at", started)).data?.length ?? 0, { timeout: 30_000 }).toBe(1);
  const { data: m } = await admin().from("media_assets").select("format,url,title").eq("event_id", eventId).gte("created_at", started).single();
  expect(m!.format).toBe("square"); expect(m!.url).toContain("/event-media/");
  const img = await page.request.get(m!.url); expect(img.headers()["content-type"]).toContain("image/png");

  await page.goto(`/organizer/events/${eventId}/media?tab=library`);
  await expect(page.locator(".pb-libg figure").filter({ hasText: "Square" }).first()).toBeVisible();
});
