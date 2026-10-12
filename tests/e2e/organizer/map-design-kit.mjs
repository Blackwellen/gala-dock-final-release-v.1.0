// E2E: design kit inside the event map studio (organizer). Adds an icon, emoji, sign and curve, saves a draft, then restores the plan.
// Usage: node --env-file=.env --env-file=.env.local tests/e2e/organizer/map-design-kit.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const EVENT = "2ac86a01-7e12-4400-91df-b9fd37827102";
const before = (await admin.from("event_plans").select("*").eq("event_id", EVENT).maybeSingle()).data;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await (await b.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1600, height: 1000 } })).newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
try {
  await p.goto(`${BASE}/organizer/events/${EVENT}/map`, { waitUntil: "load" });
  await p.locator(".mb-tabs").getByRole("button", { name: "Design" }).click();
  check("Design library panel opens", await p.getByRole("tablist", { name: "Design library" }).isVisible());
  await p.getByLabel("Search icons").fill("toilet"); await p.locator(".mb-design .dk-igrid button").first().click();
  check("Icon added and selected for editing", await p.getByRole("button", { name: /^Colour:/ }).isVisible());
  await p.locator(".mb-tabs").getByRole("button", { name: "Design" }).click(); await p.getByRole("tab", { name: "Emoji" }).click();
  await p.locator(".mb-design .dk-egrid button").first().waitFor({ timeout: 15000 }); await p.locator(".mb-design .dk-egrid button").first().click();
  await p.locator(".mb-tabs").getByRole("button", { name: "Design" }).click(); await p.getByRole("tab", { name: "Signs" }).click();
  await p.getByLabel("Search widgets").fill("first aid"); await p.locator(".mb-design .dk-wgrid button").first().click();
  // Curve tool
  await p.getByRole("button", { name: /Bendy line/ }).click();
  const box = await p.locator("svg.mb-svg").boundingBox();
  await p.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3); await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); await p.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height * 0.3);
  const kinds = await p.locator("svg.mb-svg g.vm-design").count();
  check("Design elements render on the map", kinds >= 4, `${kinds} design elements`);
  await p.screenshot({ path: "artifacts/tmp/map-design-kit.png" });
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { await p.screenshot({ path: "artifacts/tmp/map-design-kit-fail.png" }); check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  if (before) await admin.from("event_plans").update(before).eq("event_id", EVENT);
  await b.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
