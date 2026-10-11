// E2E: venue profile editors — space save + layout guard, map draft/publish + protected exits, key info + commercial forms, live toggle (run after seeding).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const venue = (await admin.from("listings").select("id,details,published,paused_at").eq("slug", "riverside-arena").single()).data;
const space = async name => (await admin.from("spaces").select("*").eq("venue_id", venue.id).eq("name", name).maybeSingle()).data;
await admin.from("spaces").delete().eq("venue_id", venue.id).eq("name", "E2E Gallery");
const published = async () => (await admin.from("venue_structures").select("version,elements").eq("venue_id", venue.id).eq("status", "published").single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } });
const page = await ctx.newPage();
page.on("dialog", d => d.accept());
const toast = async re => { try { await page.getByText(re).first().waitFor({ timeout: 30000 }); return true; } catch { return false; } };
try {
  const url = `${BASE}/provider/venues/${venue.id}`;
  // 1. Edit a space: turnaround + standing layout persist
  await page.goto(`${url}?tab=spaces`, { waitUntil: "load" });
  await page.locator(".se-list button", { hasText: "Studio Space" }).click();
  await page.getByLabel("Turnaround (minutes)").fill("75");
  await page.getByRole("button", { name: "Save space" }).click();
  await toast(/Space saved/);
  check("Space edit persists", (await space("Studio Space"))?.turnaround_minutes === 75, String((await space("Studio Space"))?.turnaround_minutes));

  // 2. A layout above the room's capacity can't be saved (client guard; provider_save_space also raises layout_exceeds_capacity)
  await page.locator(".se-layouts li", { hasText: "Theatre" }).locator('input[type="number"]').fill("5000");
  check("Over-capacity layout blocks save", await page.getByRole("button", { name: "Save space" }).isDisabled() && await page.locator(".se-warn").isVisible());

  // 3. Add a new space (draft)
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: "Add space" }).first().click();
  await page.getByLabel(/Space name/).fill("E2E Gallery");
  await page.getByLabel(/Standing capacity/).fill("60");
  await page.locator(".se-layouts li", { hasText: "Standing" }).locator('input[type="checkbox"]').check();
  await page.locator(".se-actions").getByRole("button", { name: "Add space" }).click();
  await toast(/Space added/);
  const added = await space("E2E Gallery");
  check("New space created as draft", added?.status === "draft" && added?.layouts?.standing === 60, JSON.stringify(added?.layouts));

  // 4. Map (plan builder): draft save creates a draft version; live version unchanged
  const before = await published();
  await page.reload({ waitUntil: "load" });
  const svg = page.locator(".mb-svg"); await svg.click({ position: { x: 30, y: 30 } }); await page.keyboard.press("f"); await page.waitForTimeout(300);
  const box = await svg.boundingBox();
  await page.locator(".mb-tabs button", { hasText: "Assets" }).click();
  await page.getByTitle(/^Entrance/).click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await page.locator(".mb-bar button", { hasText: "Save draft" }).click();
  await toast(/saved as draft/);
  const drafts = (await admin.from("venue_structures").select("version,status").eq("venue_id", venue.id).eq("status", "draft")).data;
  check("Map draft saved; published map unchanged", drafts.length >= 1 && (await published()).version === before.version, `drafts=${drafts.length}`);

  // 5. Protected exits can't be removed; publishing creates a new live version keeping them
  await page.locator(".mb-tabs button", { hasText: "Layers" }).click();
  await page.locator(".mb-layers li button", { hasText: "Fire exit A" }).first().click();
  check("Protected exits can’t be deleted", await page.locator(".mb-acts button.danger").isDisabled());
  await page.locator(".mb-tabs button", { hasText: "Assets" }).click();
  await page.getByTitle(/^Bar —|^Bar$/).first().click();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await page.locator(".mb-bar button", { hasText: "Publish" }).click();
  await toast(/published/);
  const after = await published();
  check("Publish creates a new live version keeping exits", after.version > before.version && after.elements.filter(e => e.type === "exit").length === 2, `v${before.version}→v${after.version}`);

  // 6. Key information form
  await page.goto(`${url}?tab=operations`, { waitUntil: "load" });
  await page.getByLabel("Curfew").fill("23:45");
  await page.getByLabel("Parking").fill("On-site (90 spaces)");
  await page.getByRole("button", { name: "Save information" }).click();
  await toast(/information saved/);
  const info = (await admin.from("listings").select("details").eq("id", venue.id).single()).data.details.info;
  check("Key information saved", info.curfew === "23:45" && info.parking === "On-site (90 spaces)", JSON.stringify(info));

  // 7. Commercial: inverted rate range refused; valid save persists
  await page.goto(`${url}?tab=commercial`, { waitUntil: "load" });
  await page.getByLabel("Rate from (£/hr)").fill("500");
  await page.getByLabel("Rate to (£/hr)").fill("300");
  await page.getByRole("button", { name: "Save commercial terms" }).click();
  check("Inverted rate range refused", await toast(/upper rate/));
  await page.getByLabel("Rate to (£/hr)").fill("650");
  await page.getByLabel("Deposit (%)").fill("35");
  await page.getByRole("button", { name: "Save commercial terms" }).click();
  await toast(/Commercial terms saved/);
  const com = (await admin.from("listings").select("price_from,details").eq("id", venue.id).single()).data;
  check("Commercial terms saved", com.details.commercial.deposit_pct === 35 && Number(com.price_from) === 500, `${com.details.commercial.deposit_pct}/${com.price_from}`);

  // 8. Live toggle pauses (existing bookings untouched) and republishes
  const jobsBefore = (await admin.from("provider_jobs").select("id,status").eq("listing_id", venue.id)).data;
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("switch").click();
  await toast(/paused/);
  const paused = (await admin.from("listings").select("published,paused_at").eq("id", venue.id).single()).data;
  const jobsAfter = (await admin.from("provider_jobs").select("id,status").eq("listing_id", venue.id)).data;
  check("Pause hides listing; bookings unaffected", !paused.published && !!paused.paused_at && JSON.stringify(jobsBefore) === JSON.stringify(jobsAfter));
  await page.reload({ waitUntil: "load" });
  await page.getByRole("switch").click();
  await toast(/published/i);
  check("Republish goes live", (await admin.from("listings").select("published").eq("id", venue.id).single()).data.published);
} catch (e) {
  await page.screenshot({ path: "artifacts/visual/planner/ve-fail.png" }).catch(() => {});
  check("unexpected error", false, e.message.split("\n")[0]);
} finally {
  await admin.from("spaces").delete().eq("venue_id", venue.id).eq("name", "E2E Gallery");
  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
