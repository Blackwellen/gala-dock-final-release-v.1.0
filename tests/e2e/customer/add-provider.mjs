// E2E: customer "Add to your event" provider finder — event-aware filters, category switch, add to compare, already-added state.
// Build items it creates are removed afterwards. Usage: node --env-file=.env --env-file=.env.local tests/e2e/customer/add-provider.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const EVENT = "efd4d0af-9437-4b0b-99cf-af7816fa2a62";   // test customer's "Alex & Taylor Wedding"
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const started = new Date().toISOString();
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errs = [];
const open = async vp => { const p = await (await b.newContext({ storageState: "artifacts/auth/customer.json", viewport: vp })).newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto(`${BASE}/account/events/${EVENT}/build?cat=food`, { waitUntil: "load", timeout: 120000 }); await p.locator("button.cb-add-tile").first().click();
  await p.locator(".pf-card:not(.sk)").first().waitFor({ timeout: 60000 }); return p; };
const settle = p => p.waitForFunction(() => !document.querySelector(".pf-grid.busy"), null, { timeout: 30000 });
try {
  const p = await open({ width: 1440, height: 900 });
  const dlg = p.getByRole("dialog");
  check("Finder opens on the category with event context", /guests/.test(await dlg.locator(".pf-summary").innerText()) && (await dlg.getByLabel("Category").inputValue()) === "food", await dlg.locator(".pf-summary").innerText());
  const all = await dlg.locator(".pf-card").count();
  check("Cards show price, location and availability", await dlg.locator(".pf-card .pf-price b").first().isVisible() && await dlg.locator(".pf-avail").count() > 0);
  check("Per-guest prices show a total for the guest count", /for \d+ guests/.test(await dlg.locator(".pf-est").first().innerText()));
  await dlg.getByRole("button", { name: /Instant book/ }).click(); await settle(p);
  const ib = await dlg.locator(".pf-card").count();
  check("Quick filter narrows or keeps results", ib <= all && await dlg.getByRole("button", { name: /Instant book/ }).getAttribute("aria-pressed") === "true", `${all} → ${ib}`);
  await dlg.getByRole("button", { name: /Instant book/ }).click(); await settle(p);
  await dlg.getByRole("button", { name: /^Filters/ }).click(); await dlg.getByRole("combobox").filter({ hasText: "Any rating" }).selectOption("4.8"); await settle(p);
  const ratings = await dlg.locator(".pf-meta b").allInnerTexts();
  check("Rating filter keeps only 4.8★+", ratings.every(r => Number(r) >= 4.8), ratings.join(","));
  await dlg.getByRole("button", { name: "Clear filters" }).click(); await settle(p);
  await dlg.getByLabel("Search providers").fill("zzzz-no-match"); await settle(p);
  check("Empty state offers to clear", await dlg.getByRole("button", { name: "Clear search and filters" }).isVisible());
  await dlg.getByRole("button", { name: "Clear search and filters" }).click(); await settle(p);
  // Add one that isn't in the build yet.
  const card = dlg.locator(".pf-card").filter({ has: p.getByRole("button", { name: /^Add$/ }) }).first();
  const name = await card.locator("h3").innerText();
  await card.getByRole("button", { name: /^Add$/ }).click();
  await dlg.locator(".pf-card").filter({ has: p.getByRole("heading", { name, exact: true }) }).locator(".pf-added").waitFor({ timeout: 20000 });
  const { data: bi } = await admin.from("build_items").select("id,title,category,status").eq("event_id", EVENT).gte("created_at", started);
  check("Add puts it in the build as a suggestion (nothing booked)", bi?.some(x => x.title === name && x.category === "food" && x.status === "suggested"), name);
  check("Dialog stays open with an Added count", /1 added/.test(await dlg.locator(".pf-done").innerText()));
  // Switch to venue: fits-guests filter appears.
  await dlg.getByLabel("Category").selectOption("venue"); await settle(p);
  check("Venue category offers Fits N guests", await dlg.getByRole("button", { name: /Fits \d+ guests/ }).isVisible());
  await dlg.getByRole("button", { name: /Fits \d+ guests/ }).click(); await settle(p);
  check("Fits-guests hides venues that are too small", await dlg.getByRole("button", { name: "Too small" }).count() === 0);
  await dlg.getByRole("button", { name: "Done" }).click();
  await p.locator(".cb-add-tile").first().waitFor();
  check("Added provider appears in the build", await p.getByText(name).first().isVisible());
  // Mobile layout.
  const m = await open({ width: 390, height: 844 });
  const w = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  check("No horizontal scroll on mobile", w[0] <= w[1] + 1, w.join(" vs "));
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally { await admin.from("build_items").delete().eq("event_id", EVENT).gte("created_at", started); await b.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
