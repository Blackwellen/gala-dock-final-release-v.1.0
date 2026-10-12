// E2E: Media Studio design kit — libraries, tools and templates. Works on a throwaway copy of an organizer design, deleted after.
// Usage: node --env-file=.env --env-file=.env.local tests/e2e/media/studio-kit.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const src = (await admin.from("designs").select("*").eq("id", "ee64ebc7-6619-42fc-995d-8e78b2b596d3").single()).data;
const { id: _i, created_at: _c, updated_at: _u, ...rest } = src;
const copy = (await admin.from("designs").insert({ ...rest, title: "E2E studio kit test", document: { unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1350, background: { type: "solid", color: "#ffffff" }, layers: [] }] }, version: 1 }).select("id").single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
const layers = async () => (await admin.from("designs").select("document").eq("id", copy.id).single()).data.document.pages[0].layers;
const tab = n => page.locator(".st-tabs").getByRole("button", { name: n, exact: true }).click();
try {
  await page.goto(`${BASE}/studio/${copy.id}`, { waitUntil: "load" });
  await page.getByRole("heading", { name: /./ }).first().waitFor({ timeout: 5000 }).catch(() => {});
  await page.locator(".st-tabs").waitFor();
  // Templates tab loads (may be empty before starters are seeded).
  await page.getByText(/Community templates are shared/).waitFor({ timeout: 15000 });
  check("Templates tab opens with search and sources", await page.getByRole("tab", { name: "Community" }).isVisible());
  // Elements → shape library
  await tab("Elements"); await page.getByLabel("Search shapes").fill("burst"); await page.locator(".dk-sgrid button").first().click();
  // Icons → Tabler set
  await tab("Icons"); await page.getByLabel("Icon library").selectOption("tabler"); await page.getByLabel("Search icons").fill("confetti"); await page.locator(".dk-igrid button").first().waitFor({ timeout: 15000 }); await page.locator(".dk-igrid button").first().click();
  // Emoji + symbol
  await tab("Emoji"); await page.locator(".dk-egrid button").first().waitFor({ timeout: 15000 }); await page.getByLabel("Search emoji").fill("party"); await page.locator(".dk-egrid button").first().click();
  await page.getByRole("tab", { name: "Symbols" }).click(); await page.locator(".dk-egrid.sym button").nth(5).click();
  // Widgets: info card + countdown
  await tab("Widgets"); await page.getByLabel("Search widgets").fill("parking"); await page.locator(".dk-wgrid button").first().click();
  await page.getByRole("tab", { name: "Widgets" }).click(); await page.getByLabel("Search widgets").fill("countdown"); await page.locator(".dk-wgrid button").first().click();
  // Text style with effect
  await tab("Text"); await page.locator(".st-tstyles button", { hasText: "Neon sign" }).click();
  // Fonts library count
  const fontCount = await page.getByLabel("Search fonts").getAttribute("placeholder");
  check("Font library loads the full catalogue", /1,?[67]\d\d/.test(fontCount ?? ""), fontCount ?? "");
  // Bendy line
  await tab("Draw"); await page.getByRole("button", { name: /Draw a line or curve/ }).click();
  const box = await page.locator(".st-page").first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.8); await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6); await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.85);
  await page.keyboard.press("Enter");
  // Airbrush stroke
  await page.locator(".st-quick button", { hasText: "Airbrush" }).click();
  await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500); // autosave
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
  const ls = await layers();
  const types = ls.map(l => l.type);
  check("Library shape added (custom path)", ls.some(l => l.type === "shape" && l.shape === "custom" && l.d), types.join(","));
  check("Tabler icon added with embedded SVG", ls.some(l => l.type === "icon" && l.icon.startsWith("tabler:") && l.svg?.body));
  check("Emoji and symbol added", ls.filter(l => l.type === "text" && l.size > 100).length >= 2);
  check("Info card widget added", ls.some(l => l.type === "widget" && l.widget === "card" && /park/i.test(l.props.title)));
  check("Countdown widget added", ls.some(l => l.type === "widget" && l.widget === "countdown"));
  check("Neon text style added", ls.some(l => l.type === "text" && l.effects?.textFx?.kind === "neon"));
  check("Bendy line saved as smooth path", ls.some(l => l.type === "path" && l.smooth && l.pts.length === 3));
  check("Airbrush stroke saved", ls.some(l => l.type === "drawing" && l.paths[0].brush === "airbrush"));
  // Colour picker: select the countdown, change accent via HEX input
  await page.locator(".st-tabs").getByRole("button", { name: "Layers", exact: true }).click();
  await page.locator(".st-lname", { hasText: "Countdown" }).click();
  await page.getByRole("button", { name: /^Accent:/ }).click(); await page.getByRole("tab", { name: "RGB" }).click();
  await page.getByLabel("R", { exact: true }).fill("255"); await page.getByLabel("G", { exact: true }).fill("0"); await page.getByLabel("B", { exact: true }).fill("0");
  await page.keyboard.press("Escape"); await page.waitForTimeout(2500); await page.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
  check("RGB colour entry updates the widget", (await layers()).some(l => l.type === "widget" && l.widget === "countdown" && l.theme.a.toLowerCase() === "#ff0000"));
  // Effect preset on text
  await page.locator(".st-lname", { hasText: "Neon sign" }).click();
  await page.getByRole("button", { name: /Browse effect presets/ }).click(); await page.getByLabel("Search effects").fill("3D gold"); await page.locator(".dk-fx button").first().click();
  await page.waitForTimeout(2500); await page.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
  check("Effect preset applied", (await layers()).some(l => l.type === "text" && l.effects?.textFx?.kind === "3d"));
  await page.screenshot({ path: "artifacts/tmp/studio-kit.png" });
  // Export still works with the new layer types.
  await page.getByRole("button", { name: "Export" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: "Download" }).click()]);
  check("PNG export succeeds with new layer types", !!(await dl.path()));
  check("No page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
} catch (e) { await page.screenshot({ path: "artifacts/tmp/studio-kit-fail.png" }).catch(() => {}); check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  await admin.from("design_versions").delete().eq("design_id", copy.id); await admin.from("designs").delete().eq("id", copy.id);
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
