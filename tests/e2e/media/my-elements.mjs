// E2E: Media Studio "My elements" — upload PNG/WebP, GIF and SVG, refuse unsafe SVG, insert, save a selection as an element,
// rename, share toggle and remove. Throwaway design and elements are deleted after.
// Usage: node --env-file=.env --env-file=.env.local tests/e2e/media/my-elements.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const started = new Date().toISOString();
mkdirSync("artifacts/tmp/elements", { recursive: true });
const gif = "artifacts/tmp/elements/sparkle.gif", svg = "artifacts/tmp/elements/badge.svg", bad = "artifacts/tmp/elements/evil.svg";
writeFileSync(gif, Buffer.from("R0lGODlhAgACAPAAAP8AAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAgACAAACAoRRACH5BAAyAAAALAAAAAACAAIAAAICDFQAOw==", "base64"));
writeFileSync(svg, `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" rx="20" fill="#0038fd"/><text x="100" y="72" font-size="40" text-anchor="middle" fill="#fff">VIP</text></svg>`);
writeFileSync(bad, `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>`);
const png = "public/design-assets/samples/" + readdirSync("public/design-assets/samples")[0];
const src = (await admin.from("designs").select("*").eq("id", "ee64ebc7-6619-42fc-995d-8e78b2b596d3").single()).data;
const { id: _i, created_at: _c, updated_at: _u, ...rest } = src;
const d = (await admin.from("designs").insert({ ...rest, title: "E2E my elements", version: 1, document: { unit: "px", dpi: 150, pages: [{ id: "p1", name: "Page 1", width: 1080, height: 1080, background: { type: "solid", color: "#ffffff" }, layers: [] }] } }).select("id").single()).data;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await (await b.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1600, height: 1000 } })).newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
const layers = async () => (await admin.from("designs").select("document").eq("id", d.id).single()).data.document.pages[0].layers;
const els = async () => (await admin.from("design_elements").select("id,kind,title,workspace_id,path,data").gte("created_at", started).order("created_at")).data ?? [];
const saved = async () => { await p.waitForTimeout(2500); await p.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 }); };
try {
  await p.goto(`${BASE}/studio/${d.id}`, { waitUntil: "load", timeout: 90000 });
  await p.locator(".st-tabs").getByRole("button", { name: "Elements", exact: true }).click();
  const me = p.getByRole("region", { name: "My elements" });
  await me.waitFor();
  check("My elements shows in the Elements tab", await me.getByRole("heading", { name: "My elements" }).isVisible());
  await me.getByLabel("Upload elements").setInputFiles([png, gif, svg]);
  await p.waitForFunction(() => document.querySelectorAll(".me-tile").length >= 3, null, { timeout: 60000 });
  const e1 = await els();
  check("PNG/WebP, GIF and SVG uploaded as elements", ["image", "gif", "svg"].every(k => e1.some(e => e.kind === k)), e1.map(e => e.kind).join(","));
  check("Shared with the team by default", e1.every(e => e.workspace_id));
  check("GIF and SVG tiles are badged", await me.locator(".me-badge", { hasText: "GIF" }).isVisible() && await me.locator(".me-badge", { hasText: "SVG" }).isVisible());
  await me.getByLabel("Upload elements").setInputFiles([bad]);
  await me.getByRole("alert").waitFor({ timeout: 30000 });
  check("Unsafe SVG is refused", /scripts|links|embedded/i.test(await me.getByRole("alert").innerText()) && (await els()).length === 3, await me.getByRole("alert").innerText());
  // Insert the GIF.
  await me.getByRole("tab", { name: "GIFs" }).click(); await me.locator(".me-tile").first().click(); await saved();
  const gl = (await layers()).find(l => l.type === "image" && /\.gif$/.test(l.asset.path ?? ""));
  check("Clicking a GIF adds it to the design (fit, not cropped)", !!gl && gl.fit === "contain");
  check("GIF loads on the canvas", await p.locator(".st-page img[src*='.gif']").evaluate(i => i.complete && i.naturalWidth > 0).catch(() => false));
  // Save a selection as an element.
  await p.locator(".st-quick button", { hasText: "Rectangle" }).click();
  await me.getByRole("button", { name: "Save selection" }).click();
  await p.getByRole("dialog").getByRole("textbox").fill("Blue box"); await p.getByRole("dialog").getByRole("button", { name: "Save element" }).click();
  await me.locator(".me-name", { hasText: "Blue box" }).waitFor({ timeout: 20000 });
  const grp = (await els()).find(e => e.kind === "group");
  check("Selection saved as a reusable group", grp?.title === "Blue box" && grp.data.layers?.length === 1);
  await saved(); const before = (await layers()).length;
  await me.locator(".me-item", { hasText: "Blue box" }).locator(".me-tile").click(); await saved();
  const after = await layers();
  check("Saved group inserts as new layers", after.length === before + 1, `${before} → ${after.length}: ${after.map(l => l.type).join(",")}`);
  // Rename, make private, remove.
  await me.getByRole("tab", { name: "All" }).click();
  await me.getByRole("button", { name: "Options for Blue box" }).click(); await p.getByRole("menuitem", { name: "Rename" }).click();
  await p.getByRole("dialog").getByRole("textbox").fill("Brand box"); await p.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  await me.locator(".me-name", { hasText: "Brand box" }).waitFor({ timeout: 15000 });
  await me.getByRole("button", { name: "Options for Brand box" }).click(); await p.getByRole("menuitem", { name: "Make private" }).click(); await p.waitForTimeout(1500);
  check("Rename and make private", (await els()).some(e => e.title === "Brand box" && !e.workspace_id));
  await me.getByRole("button", { name: "Options for Brand box" }).click(); await p.getByRole("menuitem", { name: "Remove" }).click();
  await p.getByRole("alertdialog").or(p.getByRole("dialog")).getByRole("button", { name: "Remove" }).click(); await p.waitForTimeout(1500);
  check("Remove deletes the element", !(await els()).some(e => e.title === "Brand box"));
  // Also available in the Uploads tab.
  await p.locator(".st-tabs").getByRole("button", { name: "Uploads", exact: true }).click();
  await p.getByRole("region", { name: "My elements" }).locator(".me-tile").nth(2).waitFor({ timeout: 15000 }).catch(() => {});
  check("My elements also in the Uploads tab", await p.getByRole("region", { name: "My elements" }).locator(".me-tile").count() >= 3);
  await p.screenshot({ path: "artifacts/tmp/my-elements.png" });
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { await p.screenshot({ path: "artifacts/tmp/my-elements-fail.png" }); check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  await admin.from("design_elements").delete().gte("created_at", started);
  await admin.from("design_versions").delete().eq("design_id", d.id); await admin.from("designs").delete().eq("id", d.id);
  await b.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
