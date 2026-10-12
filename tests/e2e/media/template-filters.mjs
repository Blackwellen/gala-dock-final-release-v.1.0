// E2E: template filters for organisers and providers, provider starter templates, and filter labels on Share as a template.
// Uses throwaway designs (deleted after). Usage: node --env-file=.env --env-file=.env.local tests/e2e/media/template-filters.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const PROVIDER_WS = "960fab34-54fc-40a0-85ab-cc4ea6197701";
const src = (await admin.from("designs").select("*").eq("id", "ee64ebc7-6619-42fc-995d-8e78b2b596d3").single()).data;
const { id: _i, created_at: _c, updated_at: _u, ...rest } = src;
const blank = { unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1080, background: { type: "solid", color: "#ffffff" }, layers: [] }] };
const prov = (await admin.from("designs").insert({ ...rest, workspace_id: PROVIDER_WS, event_id: null, owner_id: "126fe7c5-77f8-48bd-ac6e-aba1d1df17d8", title: "E2E provider templates", version: 1, document: blank }).select("id").single()).data;
const org = (await admin.from("designs").insert({ ...rest, title: "E2E organiser templates", version: 1, document: blank }).select("id").single()).data;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errs = [];
const open = async (who, id) => { const p = await (await b.newContext({ storageState: `artifacts/auth/${who}.json`, viewport: { width: 1600, height: 1000 } })).newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto(`${BASE}/studio/${id}`, { waitUntil: "load" }); await p.getByLabel("Search templates").waitFor({ timeout: 20000 }); await p.locator(".st-tcard").first().waitFor({ timeout: 20000 }); return p; };
const titles = async p => p.locator(".st-tcard b").allInnerTexts();
let shared;
try {
  // Provider: provider templates by default.
  const p = await open("provider", prov.id);
  check("Provider studio filters to venues & suppliers by default", (await p.locator(".tf-chip").first().innerText()).includes("Venues & suppliers"));
  let t = await titles(p);
  check("Provider starter templates are listed", t.some(x => /Venue showcase|DJ|Catering|Photograph/.test(x)) && !t.some(x => /Club night|Rave|Warehouse/.test(x)), `${t.length} shown`);
  await p.screenshot({ path: "artifacts/tmp/templates-provider.png" });
  await p.getByRole("button", { name: /^Filters/ }).click();
  await p.getByLabel("Filter by business type").selectOption("dj"); await p.waitForTimeout(1200);
  t = await titles(p); check("Business type filter (DJ)", t.length > 0 && t.every(x => /DJ|Neon|Violet|Cyan/.test(x)), t.join(", "));
  await p.getByLabel("Filter by format").selectOption("square"); await p.waitForTimeout(1200);
  const sm = await p.locator(".st-tcard small").allInnerTexts(); check("Format filter (square) narrows results", sm.length > 0 && sm.every(x => x.includes("Square")), sm.join(" | "));
  await p.getByRole("button", { name: "Clear all" }).click(); await p.waitForTimeout(1200);
  check("Clear all shows every template", (await titles(p)).length > 40);
  await p.getByLabel("Filter by purpose").selectOption("testimonial"); await p.waitForTimeout(1200);
  t = await titles(p); check("Purpose filter (testimonial)", t.length >= 4 && t.every(x => x.startsWith("Review")), t.join(", "));
  // Share as a template carries the same labels.
  await p.getByRole("button", { name: "Share template" }).click();
  check("Share form defaults to venues & suppliers", (await p.locator("select[name=audience]").inputValue()) === "provider");
  await p.locator("select[name=category]").selectOption("special_offer"); await p.locator("select[name=business]").selectOption("venue");
  await p.locator("select[name=style]").selectOption("luxury"); await p.locator("select[name=palette]").selectOption("black_gold");
  await p.locator("select[name=visibility]").selectOption("private");
  await p.getByRole("button", { name: "Save template" }).click(); await p.getByText("Template saved.").waitFor({ timeout: 20000 });
  shared = (await admin.from("design_templates").select("id,audience,category,business_type,style,palette,format").eq("source_design_id", prov.id).order("created_at", { ascending: false }).limit(1).single()).data;
  check("Saved template has its filter labels", shared?.audience === "provider" && shared.category === "special_offer" && shared.business_type === "venue" && shared.style === "luxury" && shared.palette === "black_gold" && shared.format === "square", JSON.stringify(shared));
  // Organiser: organiser templates by default, no provider-only ones.
  const o = await open("organizer", org.id);
  check("Organiser studio filters to event organisers by default", (await o.locator(".tf-chip").first().innerText()).includes("Event organisers"));
  t = await titles(o); check("Organiser list has event templates, no provider-only ones", t.some(x => /Club night|Concert|Festival/.test(x)) && !t.some(x => /DJ packages|Venue showcase|Review —/.test(x)), `${t.length} shown`);
  await o.getByRole("button", { name: /^Filters/ }).click();
  await o.getByLabel("Filter by event type").selectOption("wedding"); await o.waitForTimeout(1200);
  t = await titles(o); check("Event type filter (wedding)", t.length > 0 && t.every(x => /Wedding|Garden|Story — Save/.test(x)), t.join(", "));
  await o.getByLabel("Filter by colour").selectOption("neutral"); await o.waitForTimeout(1200);
  check("Colour filter combines with event type", (await titles(o)).length >= 1, (await titles(o)).join(", "));
  await o.screenshot({ path: "artifacts/tmp/templates-organiser.png" });
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  if (shared?.id) await admin.from("design_templates").delete().eq("id", shared.id);
  for (const d of [prov, org]) { await admin.from("design_versions").delete().eq("design_id", d.id); await admin.from("designs").delete().eq("id", d.id); }
  await b.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
