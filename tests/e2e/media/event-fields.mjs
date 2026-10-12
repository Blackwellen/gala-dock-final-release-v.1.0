// E2E: event details in plain English in Media Studio — no {{braces}} shown, insert dropdown, stored canonically.
// Uses a throwaway design linked to a real event. Usage: node --env-file=.env --env-file=.env.local tests/e2e/media/event-fields.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const src = (await admin.from("designs").select("*").eq("id", "ee64ebc7-6619-42fc-995d-8e78b2b596d3").single()).data;
const { id: _i, created_at: _c, updated_at: _u, ...rest } = src;
const copy = (await admin.from("designs").insert({ ...rest, event_id: "2ac86a01-7e12-4400-91df-b9fd37827102", title: "E2E event fields", version: 1,
  document: { unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1350, background: { type: "solid", color: "#ffffff" }, layers: [] }] } }).select("id").single()).data;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await (await b.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1600, height: 1000 } })).newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
const doc = async () => (await admin.from("designs").select("document").eq("id", copy.id).single()).data.document.pages[0].layers;
try {
  await p.goto(`${BASE}/studio/${copy.id}`, { waitUntil: "load" });
  await p.locator(".st-tabs").getByRole("button", { name: "Text", exact: true }).click();
  const grid = p.locator(".ef-grid");
  check("Event details shown in plain English with live values", await grid.getByText("Event name").isVisible() && await grid.getByText("Sunset Sessions").isVisible());
  check("No {{braces}} anywhere in the side panel", !(await p.locator(".st-panel").innerText()).includes("{{"));
  await grid.getByRole("button", { name: /Venue/ }).click();
  const field = p.getByRole("textbox", { name: "Text" });
  check("Text field shows [Venue] not {{event.venue_name}}", (await field.inputValue()) === "[Venue]");
  await field.fill("Join us at [Venue] — ");
  await p.getByRole("button", { name: "Insert detail" }).first().click();
  await p.getByRole("menuitem", { name: /Date/ }).click();
  await p.waitForTimeout(2500); await p.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
  const l = (await doc()).find(x => x.type === "text");
  check("Saved with canonical tokens", l.text === "Join us at {{event.venue_name}} — {{event.date}}", l.text);
  check("Canvas shows the real event values", (await p.locator(".st-page").first().innerText()).includes("Join us at"));
  // Typing on the canvas: "{" opens the insert menu; picking inserts at the caret.
  await p.locator(".st-page [data-layer]").filter({ hasText: "Join us at" }).first().dblclick();
  const span = p.locator(".st-page [contenteditable=true]").first(); await span.waitFor();
  check("Editing bar with Insert event detail appears", await p.locator(".st-editbar").getByRole("button", { name: /Insert event detail/ }).isVisible());
  await span.press("End"); await p.keyboard.type(" in "); await p.keyboard.press("{");
  await p.getByRole("menuitem", { name: /City/ }).click();
  check("Pick inserts [City] at the caret", (await span.innerText()).includes("in [City]"), await span.innerText());
  await p.locator(".st-stage").click({ position: { x: 10, y: 10 } });
  await p.waitForTimeout(2500); await p.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
  check("Canvas edit saved with canonical token", (await doc()).some(x => x.type === "text" && x.text.includes("in {{event.city}}")), (await doc()).find(x => x.type === "text")?.text);
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await p.screenshot({ path: "artifacts/tmp/event-fields.png" });
} catch (e) { await p.screenshot({ path: "artifacts/tmp/event-fields-fail.png" }); check("unexpected error", false, e.message.split("\n")[0]); }
finally { await admin.from("design_versions").delete().eq("design_id", copy.id); await admin.from("designs").delete().eq("id", copy.id); await b.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
