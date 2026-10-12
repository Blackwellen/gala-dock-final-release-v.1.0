// E2E: fan resale (BUY-W02) through Stripe test mode. Lists a seated ticket from a previous buy.mjs order and buys it as a different user.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const S = "artifacts/visual/checkout"; const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const ev = (await admin.from("events").select("id").eq("slug", "comedy-central-live").single()).data;
// A seated ticket from a previous order that still owns its seat row (older runs may have left tickets whose seat was re-mapped).
const owned = new Set(((await admin.from("event_seats").select("ticket_id").eq("event_id", ev.id).not("ticket_id", "is", null)).data ?? []).map(s => s.ticket_id));
const seller = ((await admin.from("tickets").select("id,holder_id,seat,price_paid").eq("event_id", ev.id).eq("status", "valid").not("seat", "is", null).like("order_ref", "GD-%")).data ?? []).find(t => owned.has(t.id));
await admin.from("tickets").update({ status: "resale_listed" }).eq("id", seller.id); // the seller's own "List for resale" action (customer area) does the same via list_ticket_for_resale
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
try {
  await page.goto(`${BASE}/checkout/comedy-central-live?resale=1`, { waitUntil: "networkidle" });
  await page.locator(".co-resale li", { hasText: seller.seat }).getByRole("button", { name: "Select" }).click();
  await page.screenshot({ path: `${S}/r1-resale.png` });
  await page.getByRole("button", { name: /Reserve 1 ticket/ }).click();
  await page.getByText(/Tickets reserved for/).waitFor({ timeout: 30000 });
  check("Listing held for buyer", (await admin.from("resale_holds").select("ticket_id").eq("ticket_id", seller.id)).data.length === 1);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: pub } = await anon.rpc("resale_listings", { p_event: ev.id });
  check("Held listing disappears from public resale", !pub.some(l => l.id === seller.id) && pub.every(l => !("holder_id" in l)));
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 });
  await page.getByTestId("card-accordion-item").click();
  await page.locator("#cardNumber").fill("4242424242424242"); await page.locator("#cardExpiry").fill("12 / 34"); await page.locator("#cardCvc").fill("123");
  const nm = page.locator("#billingName"); if (await nm.count()) await nm.fill("Riverside Buyer");
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(/\/confirmation\?order=GD-/, { timeout: 90000 });
  await page.getByText(/You’re going!/).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${S}/r2-confirmed.png` });
  const order = new URL(page.url()).searchParams.get("order");
  const old = (await admin.from("tickets").select("status,replaced_by").eq("id", seller.id).single()).data;
  const nu = (await admin.from("tickets").select("id,holder_id,seat").eq("order_ref", order)).data;
  const seat = (await admin.from("event_seats").select("ticket_id").eq("event_id", ev.id).eq("ticket_id", nu[0]?.id)).data;
  const pay = (await admin.from("resale_payouts").select("seller_id,amount,status").eq("ticket_id", seller.id).single()).data;
  check("Seller’s ticket marked resold → new ticket", old.status === "resold" && old.replaced_by === nu[0]?.id);
  check("New ticket issued to buyer for the same seat", nu.length === 1 && nu[0].seat === seller.seat && nu[0].holder_id !== seller.holder_id);
  check("Seat inventory points at the new ticket", seat.length === 1);
  check("Seller payout recorded as pending", pay.seller_id === seller.holder_id && Number(pay.amount) === Number(seller.price_paid) && pay.status === "pending");
  check("No page errors", errs.length === 0, errs.join(" | "));
} catch (e) { await page.screenshot({ path: `${S}/r-fail.png` }).catch(() => {}); check("unexpected error", false, e.message.split("\n")[0]); }
finally { await browser.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1); }
