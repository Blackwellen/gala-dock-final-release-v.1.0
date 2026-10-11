// E2E: organiser event layout → reserved-seat inventory → atomic buyer holds (run after seeding). Uses "Sunset Sessions" (public, on sale).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const ev = (await admin.from("events").select("id,name").eq("name", "Sunset Sessions").single()).data;
const tier = (await admin.from("ticket_tiers").select("id,name,held,sold,quantity").eq("event_id", ev.id).eq("status", "on_sale").limit(1).single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1536, height: 1024 } });
const page = await ctx.newPage(); page.on("dialog", d => d.accept()); const errs = []; page.on("pageerror", e => errs.push(e.message));
try {
  await page.goto(`${BASE}/organizer/events/${ev.id}/map`, { waitUntil: "networkidle" });
  check("Event layout page renders the planner", await page.locator(".mb-svg").isVisible());
  await page.getByRole("button", { name: /Theatre rows/ }).click();
  // the three new blocks are selected → assign the tier to all of them
  await page.locator(".mb-props select").first().selectOption(tier.id);
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByText(/published ·/).first().waitFor({ timeout: 30000 });
  const { count } = await admin.from("event_seats").select("*", { count: "exact", head: true }).eq("event_id", ev.id).eq("tier_id", tier.id);
  check("Publishing syncs 288 reserved seats with the tier", count === 288, String(count));

  const keys = ["A-A-1", "A-A-2"], tokenA = crypto.randomBytes(16).toString("hex"), tokenB = crypto.randomBytes(16).toString("hex");
  const h1 = await anon.rpc("hold_seats", { p_event: ev.id, p_keys: keys, p_token: tokenA });
  check("Buyer A holds 2 seats", !h1.error && h1.data?.held === 2, h1.error?.message ?? "");
  const h2 = await anon.rpc("hold_seats", { p_event: ev.id, p_keys: ["A-A-2", "A-A-3"], p_token: tokenB });
  check("Buyer B can't hold an already-held seat (all-or-nothing)", !!h2.error && /seat_unavailable/.test(h2.error.message), h2.error?.message ?? "no error");
  const b3 = (await admin.from("event_seats").select("status").eq("event_id", ev.id).eq("seat_key", "A-A-3").single()).data;
  check("Failed hold leaves other seats untouched", b3.status === "available", b3.status);
  const t1 = (await admin.from("ticket_tiers").select("held").eq("id", tier.id).single()).data;
  check("Tier held count includes seat holds", t1.held === tier.held + 2, `${tier.held} → ${t1.held}`);
  const pub = await anon.from("event_seats").select("seat_key,status").eq("event_id", ev.id).eq("seat_key", "A-A-1").single();
  check("Public can see availability but not hold tokens", pub.data?.status === "held" && !("hold_token" in (pub.data ?? {})), JSON.stringify(pub.data));
  const tok = await anon.from("event_seats").select("hold_token").eq("event_id", ev.id).limit(1);
  check("hold_token column isn't readable", !!tok.error, tok.error?.message ?? "readable!");
  const r = await anon.rpc("release_seat_holds", { p_token: tokenA });
  const t2 = (await admin.from("ticket_tiers").select("held").eq("id", tier.id).single()).data;
  check("Release frees seats and tier counts", r.data === 2 && t2.held === tier.held, `${r.data} / held ${t2.held}`);
  check("No page errors", errs.length === 0, errs.join(" | "));
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  await admin.from("event_seats").delete().eq("event_id", ev.id);
  await admin.from("venue_maps").delete().eq("event_id", ev.id).filter("structure->>format", "eq", "plan-v2");
  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
