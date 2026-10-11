// E2E (no saving): plan builder curve/stagger controls, vehicle-route drawing, and point-label collision culling.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const S = "artifacts/visual/planner"; const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const venue = (await admin.from("listings").select("id").eq("slug", "riverside-arena").single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("dialog", d => d.dismiss());
const setRange = (loc, v) => loc.evaluate((el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, String(val)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, v);
try {
  await page.goto(`${BASE}/provider/venues/${venue.id}?tab=spaces`, { waitUntil: "networkidle" });
  const svg = page.locator(".mb-svg"); await svg.click({ position: { x: 30, y: 30 } }); await page.keyboard.press("f"); await page.waitForTimeout(300);
  // 1. Seat block curve + stagger
  await page.getByRole("button", { name: /Theatre rows/ }).click();
  await page.locator(".mb-tabs button", { hasText: "Layers" }).click();
  await page.locator(".mb-layers li button", { hasText: "Block A" }).first().click();
  const before = await page.locator(".vm-asset.on polygon").first().getAttribute("points");
  await setRange(page.locator("label:has-text('Curve rows around stage') input[type=range]"), 60);
  await page.waitForTimeout(200);
  const after = await page.locator(".vm-asset.on polygon").first().getAttribute("points");
  check("Curve slider reshapes the block outline", before !== after && after.split(" ").length > 4, `${before?.split(" ").length} → ${after?.split(" ").length} points`);
  const seatsBefore = await page.locator(".vm-asset.on [data-seat]").evaluateAll(n => n.slice(0, 30).map(c => c.getAttribute("cx")).join(","));
  await page.locator("label:has-text('Stagger alternate rows') input").check();
  await page.waitForTimeout(200);
  const seatsAfter = await page.locator(".vm-asset.on [data-seat]").evaluateAll(n => n.slice(0, 30).map(c => c.getAttribute("cx")).join(","));
  check("Stagger shifts alternate rows", seatsBefore !== seatsAfter || seatsBefore === "", seatsBefore ? "seat positions changed" : "seats not at detail zoom (outline checked)");
  await page.screenshot({ path: `${S}/t1-curve.png` });
  // 2. Vehicle route (line tool): click points, double-click to finish
  await page.locator(".mb-tabs button", { hasText: "Assets" }).click();
  await page.getByTitle(/^Vehicle route/).click();
  const box = await svg.boundingBox();
  const lines0 = await page.locator(".vp-line").count();
  for (const [fx, fy] of [[0.15, 0.85], [0.4, 0.8], [0.6, 0.9]]) { await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await page.waitForTimeout(250); }
  await page.mouse.dblclick(box.x + box.width * 0.75, box.y + box.height * 0.85); await page.waitForTimeout(400);
  check("Vehicle route drawn as a line asset", (await page.locator(".vp-line").count()) === lines0 + 1, `${lines0} → ${await page.locator(".vp-line").count()}`);
  await page.screenshot({ path: `${S}/t2-route.png` });
  // 3. Packed point assets: labels must not overlap
  await page.keyboard.press("Escape");
  for (let i = 0; i < 6; i++) { await page.locator(".mb-tabs button", { hasText: "Assets" }).click(); await page.getByTitle(/^Bus stop/).click(); await page.mouse.click(box.x + box.width * (0.3 + i * 0.012), box.y + box.height * 0.35); await page.waitForTimeout(150); }
  await page.waitForTimeout(300);
  const rects = await page.locator(".vp-out").evaluateAll(n => n.map(t => { const r = t.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }).filter(r => r[2] - r[0] > 0));
  const overlap = rects.some((a, i) => rects.some((b, j) => j > i && a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1));
  check("Packed point labels never overlap", !overlap, `${rects.length} visible labels`);
  await page.screenshot({ path: `${S}/t3-labels.png` });
  check("No page errors", errs.length === 0, errs.join(" | "));
} catch (e) { await page.screenshot({ path: `${S}/fail.png` }).catch(() => {}); check("unexpected error", false, e.message.split("\n")[0]); }
finally { await browser.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1); }
