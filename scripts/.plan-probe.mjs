import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const venue = (await admin.from("listings").select("id").eq("slug", "riverside-arena").single()).data;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const c = await b.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } });
await c.addInitScript(() => localStorage.setItem("gd-density", "reference"));
const p = await c.newPage(); p.on("dialog", d => d.accept()); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:3107/provider/venues/" + venue.id + "?tab=spaces", { waitUntil: "networkidle" });
await p.locator(".mb-svg").click({ position: { x: 20, y: 20 } });
await p.keyboard.press("f");
await p.waitForTimeout(300);
await p.getByRole("button", { name: /Banquet dinner/ }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen---Business-Files-gala-dock-final-release/102cd9f2-8d76-43b6-9a75-f12284a08c37/scratchpad/plan-1.png" });
// place a seat block by click-then-place
await p.getByTitle(/^Seating block/).click();
const box = await p.locator(".mb-svg").boundingBox();
await p.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
// zoom in on it
for (let i = 0; i < 6; i++) { await p.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75); await p.mouse.wheel(0, -300); await p.waitForTimeout(80); }
await p.waitForTimeout(300);
const seats = p.locator(".vp-seat.hit");
console.log("seat circles", await seats.count());
if (await seats.count()) { await seats.nth(0).click(); await seats.nth(1).click({ modifiers: ["Shift"] }); await p.getByRole("button", { name: "Block", exact: true }).click(); }
await p.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen---Business-Files-gala-dock-final-release/102cd9f2-8d76-43b6-9a75-f12284a08c37/scratchpad/plan-2.png" });
await p.getByRole("button", { name: "Save draft" }).click();
await p.waitForTimeout(2500);
const d = (await admin.from("venue_structures").select("version,status,elements").eq("venue_id", venue.id).order("version", { ascending: false }).limit(1).single()).data;
const assets = d.elements.filter(e => e.type === "asset");
console.log("saved v", d.version, d.status, "assets", assets.length, "tables", assets.filter(a => a.table).length, "blocked flags", assets.flatMap(a => Object.values(a.seatFlags ?? {})).length);
console.log("errors", errs);
await b.close();
