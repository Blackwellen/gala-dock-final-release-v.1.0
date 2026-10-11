// E2E: create a direct venue booking through the 3-step wizard; refuse an overlapping booking (run after seeding).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + 80 * 864e5));
await admin.from("provider_jobs").delete().like("event_name", "E2E Wizard%");
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } });
await ctx.addInitScript(() => { try { localStorage.setItem("gd-density", "reference"); } catch {} });
const page = await ctx.newPage();
await fs.mkdir("artifacts/visual/ws/screens", { recursive: true });
async function runWizard(name, shoot) {
  await page.goto(`${BASE}/provider/bookings/new?step=1`, { waitUntil: "load" });
  await page.getByLabel("Event name *").fill(name);
  await page.getByLabel("Expected guest count *").fill("120");
  await page.getByLabel("Event date *").fill(date);
  await page.getByLabel("Start time *").fill("18:00");
  await page.getByLabel("End time *").fill("23:00");
  await page.getByLabel("Client / Organisation *").fill("TechCorp Ltd");
  if (shoot) await page.screenshot({ path: "artifacts/visual/ws/screens/prov-w06-s1.png" });
  await page.getByRole("button", { name: /Continue to Space/ }).click();
  await page.waitForURL(/step=2/, { timeout: 60000 });
  await page.getByRole("radio", { name: /Main Hall/ }).click();
  if (shoot) await page.screenshot({ path: "artifacts/visual/ws/screens/prov-w06-s2.png" });
  const next = page.getByRole("button", { name: /Continue to Pricing/ });
  if (await next.isDisabled()) return "blocked-at-space";
  await next.click();
  await page.waitForURL(/step=3/, { timeout: 60000 });
  if (shoot) await page.screenshot({ path: "artifacts/visual/ws/screens/prov-w06-s3.png" });
  const confirm = page.getByRole("button", { name: "Confirm booking" });
  if (await confirm.isDisabled()) return "blocked-at-confirm";
  await confirm.click();
  await page.waitForURL(/\/provider\/bookings\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {});
  return page.url();
}
try {
  const url = await runWizard("E2E Wizard Gala", true);
  const job = (await admin.from("provider_jobs").select("*").eq("event_name", "E2E Wizard Gala").maybeSingle()).data;
  check("Booking created and opened", !!job && url.includes(job.id), url);
  check("Value recomputed server-side, no payment recorded", job && Number(job.value) > 0 && job.payment_status === "unpaid" && Number(job.paid_amount) === 0, `£${job?.value} ${job?.payment_status}`);
  check("Immutable commercial snapshot captured", job && job.commercial_snapshot?.value === Number(job.value) && Array.isArray(job.commercial_snapshot?.cancellation));
  const second = await runWizard("E2E Wizard Clash", false);
  const clash = (await admin.from("provider_jobs").select("id").eq("event_name", "E2E Wizard Clash")).data ?? [];
  check("Overlapping booking on same space refused", second.startsWith("blocked") && clash.length === 0, second);
} catch (e) { check("Unhandled error", false, e.message.split("\n")[0]); }
finally { await browser.close(); await admin.from("provider_jobs").delete().like("event_name", "E2E Wizard%"); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
