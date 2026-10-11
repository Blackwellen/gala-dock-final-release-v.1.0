import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// ORG-012 page editor (save draft persists hero copy) and W07 Save as Template (snapshot without personal/financial data).
let eventId = ""; let original: Record<string, unknown> = {}; const tpl = `E2E Template ${Date.now()}`;
test.beforeAll(async () => { const { data } = await admin().from("events").select("id,settings").eq("name", "Neon Nights Festival").is("settings->>demo_copy_of", null).limit(1).single(); eventId = data!.id; original = (data!.settings ?? {}) as Record<string, unknown>; });
test.afterAll(async () => { const db = admin(); await db.from("events").update({ settings: original }).eq("id", eventId); await db.from("event_templates").delete().eq("name", tpl); });

test("page editor saves hero copy as a draft", async ({ page }) => {
  await login(page, "organizer", `/organizer/events/${eventId}/page`);
  await page.goto(`/organizer/events/${eventId}/page`, { waitUntil: "load" });
  const sub = page.locator("label").filter({ hasText: /^Subtitle/ }).locator("input");
  await sub.fill("E2E subtitle — three stages, one night");
  await page.getByRole("button", { name: /^Save draft/ }).click();
  await expect.poll(async () => ((await admin().from("events").select("settings").eq("id", eventId).single()).data!.settings as Record<string, unknown>).subtitle, { timeout: 20_000 }).toBe("E2E subtitle — three stages, one night");
  // The public page reflects it (preview mode shows saved settings).
  if (original && (original as { slug?: string })) {
    const { data: e } = await admin().from("events").select("slug").eq("id", eventId).single();
    await page.goto(`/events/${e!.slug}?preview=1`, { waitUntil: "load" });
    await expect(page.getByText("E2E subtitle — three stages, one night").first()).toBeVisible();
  }
});

test("save event as template", async ({ page }) => {
  await login(page, "organizer", `/organizer/events/${eventId}/template?step=2`);
  await page.goto(`/organizer/events/${eventId}/template?step=2`, { waitUntil: "networkidle" });
  const name = page.locator("label").filter({ hasText: /^Template name/ }).locator("input");
  await name.fill(tpl);
  await page.getByRole("button", { name: /Save Template/ }).click();
  await expect.poll(async () => (await admin().from("event_templates").select("id").eq("name", tpl)).data?.length ?? 0, { timeout: 20_000 }).toBe(1);
  const { data: t } = await admin().from("event_templates").select("modules,source_event_id").eq("name", tpl).single();
  expect(t!.source_event_id).toBe(eventId);
  const blob = JSON.stringify(t!.modules);
  expect(blob).not.toMatch(/@example\.com|stripe|amount_paid|\+44/i); // no personal or financial data in the snapshot
});
