// E2E: booking lifecycle, crew assignment conflict guard, cancellation with reason, CSV export (run after seeding).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const job = async name => (await admin.from("provider_jobs").select("id,status,payment_status,starts_at,ends_at,workspace_id").eq("event_name", name).single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } });
const page = await ctx.newPage();
try {
  // 1. Confirmed → active via header action; payment status untouched
  const pod = await job("Podcast Recording");
  await page.goto(`${BASE}/provider/bookings/${pod.id}`, { waitUntil: "load" });
  await page.locator(".pk-primary").click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as arrived" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  const pod2 = await job("Podcast Recording");
  check("Mark as arrived → active (payment unchanged)", pod2.status === "active" && pod2.payment_status === pod.payment_status, `${pod2.status}/${pod2.payment_status}`);

  // 2. Assign crew already on an overlapping shift → refused
  const anniv = await job("Anniversary Dinner");
  const busy = (await admin.from("shifts").select("crew_id,crew:crew_members(name)").eq("job_id", (await job("Podcast Recording")).id).limit(1).single()).data;
  // put Anniversary Dinner on the same time as Podcast Recording for the conflict case
  await admin.from("provider_jobs").update({ starts_at: pod.starts_at, ends_at: pod.ends_at }).eq("id", anniv.id);
  await page.goto(`${BASE}/provider/bookings/${anniv.id}?tab=team`, { waitUntil: "load" });
  await page.locator('select[name="crew"]').selectOption(busy.crew_id);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  const err = await page.locator(".ws-form-error").textContent({ timeout: 30000 });
  check("Double-booked crew member refused", /already assigned/.test(err ?? ""), err ?? "");

  // 3. Cancel needs a reason; with a reason it cancels
  await page.goto(`${BASE}/provider/bookings/${anniv.id}?tab=commercial`, { waitUntil: "load" });
  await page.locator(".pk-cancel .ws-btn").click();
  await page.getByRole("dialog").locator("textarea").fill("Client postponed");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  check("Cancel with reason → cancelled", (await job("Anniversary Dinner")).status === "cancelled");
  const { data: audit } = await admin.from("audit_events").select("metadata").eq("event", "booking.cancelled").contains("metadata", { job_id: anniv.id });
  check("Cancellation reason audited", audit?.[0]?.metadata?.reason === "Client postponed");

  // 4. CSV export is scoped and well-formed
  const res = await ctx.request.get(`${BASE}/provider/bookings/export?tab=upcoming`);
  const text = await res.text();
  check("CSV export", res.status() === 200 && text.startsWith("Reference,Event") && !text.includes("Hope Trust Gala 2099"), `${text.split("\n").length - 1} rows`);
} catch (e) { check("Unhandled error", false, e.message.split("\n")[0]); }
finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
