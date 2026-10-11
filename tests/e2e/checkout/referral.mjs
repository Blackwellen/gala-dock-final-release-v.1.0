// E2E: promoter referral → checkout → promoter sale credited (Stripe test mode). Requires scripts/seed-portals.mjs (promoter code JORDAN on Neon Nights).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const pr = (await admin.from("promoters").select("id,code,commission_pct,tickets_sold,event_id,events(slug)").eq("code", "JORDAN").limit(1).single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
try {
  await page.goto(`${BASE}/r/${pr.code}`);
  check("Referral link sets the gd_ref cookie", (await ctx.cookies()).some(c => c.name === "gd_ref" && c.value.startsWith(pr.code)));
  await page.goto(`${BASE}/checkout/${pr.events.slug}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^More / }).first().click();
  await page.getByRole("button", { name: /Reserve 1 ticket/ }).click();
  await page.getByText(/Tickets reserved for/).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 });
  await page.getByTestId("card-accordion-item").click();
  await page.locator("#cardNumber").fill("4242424242424242"); await page.locator("#cardExpiry").fill("12 / 34"); await page.locator("#cardCvc").fill("123");
  const nm = page.locator("#billingName"); if (await nm.count()) await nm.fill("Alex Thomas");
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(/\/confirmation\?order=GD-/, { timeout: 90000 });
  const order = new URL(page.url()).searchParams.get("order");
  const o = (await admin.from("checkout_orders").select("ref_code,amount,status").eq("order_ref", order).single()).data;
  const sale = (await admin.from("promoter_sales").select("promoter_id,quantity,amount,commission,status").eq("order_ref", order)).data;
  check("Order stores the referral code", o.ref_code === pr.code && o.status === "issued", JSON.stringify(o));
  check("Promoter credited with a pending sale at their rate", sale.length === 1 && sale[0].promoter_id === pr.id && sale[0].status === "pending" && Math.abs(Number(sale[0].commission) - Number(sale[0].amount) * pr.commission_pct / 100) < 0.01, JSON.stringify(sale[0]));
  const after = (await admin.from("promoters").select("tickets_sold").eq("id", pr.id).single()).data;
  check("Promoter ticket count increased", after.tickets_sold === pr.tickets_sold + 1, `${pr.tickets_sold} → ${after.tickets_sold}`);
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally { await browser.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1); }
