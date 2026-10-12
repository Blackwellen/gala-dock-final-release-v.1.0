// E2E: reserved-seat + GA checkout through Stripe test mode (card 4242), then DB verification. Run after scripts/seed-checkout.mjs.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const S = process.env.SHOTS ?? "artifacts/visual/checkout";
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const ev = (await admin.from("events").select("id").eq("slug", "comedy-central-live").single()).data;
const free = (await admin.from("event_seats").select("seat_key,tier_id").eq("event_id", ev.id).eq("status", "available").like("seat_key", "B-%").order("seat_key").limit(2)).data;
const ga = (await admin.from("ticket_tiers").select("id,sold,held").eq("event_id", ev.id).eq("name", "Standard").single()).data;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
try {
  await page.goto(`${BASE}/checkout/comedy-central-live`, { waitUntil: "networkidle" });
  for (const s of free) { await page.locator(`[data-seat="${s.seat_key}"]`).first().dispatchEvent("pointerdown", { button: 0, pointerId: 1, isPrimary: true }); await page.waitForTimeout(150); }
  check("Picker selects 2 seats", (await page.getByText(/2 of 10 seats|2 seats/).count()) > 0);
  await page.getByRole("button", { name: /More Standard/ }).click();
  await page.screenshot({ path: `${S}/1-selected.png` });
  await page.getByRole("button", { name: /Reserve 3 tickets/ }).click();
  await page.getByText(/Tickets reserved for/).waitFor({ timeout: 30000 });
  const held = (await admin.from("event_seats").select("status").eq("event_id", ev.id).in("seat_key", free.map(f => f.seat_key))).data;
  const gaHeld = (await admin.from("ticket_tiers").select("held").eq("id", ga.id).single()).data;
  check("Seats held + GA held in DB", held.every(h => h.status === "held") && gaHeld.held === ga.held + 1, `${held.map(h => h.status)} / ga held ${gaHeld.held}`);
  await page.screenshot({ path: `${S}/2-review.png` });
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 });
  if (!page.url().includes("cs_test_")) throw new Error("Refusing payment: this is not a Stripe test-mode Checkout session.");
  check("Redirected to Stripe Checkout", true);
  await page.getByTestId("card-accordion-item").click();
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  const name = page.locator("#billingName"); if (await name.count()) await name.fill("Alex Thomas");
  const pc = page.locator("#billingPostalCode"); if (await pc.count()) await pc.fill("SE1 9PP");
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(/\/confirmation\?order=GD-/, { timeout: 90000 });
  await page.getByText(/You’re going!/).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${S}/3-confirmed.png` });
  const order = new URL(page.url()).searchParams.get("order");
  const tix = (await admin.from("tickets").select("seat,tier_id").eq("order_ref", order)).data;
  const sold = (await admin.from("event_seats").select("status").eq("event_id", ev.id).in("seat_key", free.map(f => f.seat_key))).data;
  const ga2 = (await admin.from("ticket_tiers").select("sold,held").eq("id", ga.id).single()).data;
  const o = (await admin.from("checkout_orders").select("status").eq("order_ref", order).single()).data;
  check("3 tickets issued (2 seated + 1 GA)", tix.length === 3 && tix.filter(t => t.seat).length === 2, `${tix.length}`);
  check("Seats sold, GA moved held→sold", sold.every(s => s.status === "sold") && ga2.sold === ga.sold + 1 && ga2.held === ga.held, `${ga.sold}->${ga2.sold}, held ${ga2.held}`);
  check("Order marked issued", o.status === "issued");
  // Idempotency: hitting the success URL again must not issue more tickets.
  const sess = (await admin.from("checkout_orders").select("stripe_session").eq("order_ref", order).single()).data.stripe_session;
  await page.goto(`${BASE}/api/checkout/complete?session_id=${sess}`);
  check("Re-completing is idempotent", (await admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_ref", order)).count === 3);
  // Reserved seat can't be taken by someone else.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await anon.rpc("hold_seats", { p_event: ev.id, p_keys: [free[0].seat_key], p_token: "x".repeat(24) });
  check("Sold seat can’t be held again", !!error && /seat_unavailable/.test(error.message));
  check("No page errors", errs.length === 0, errs.join(" | "));
} catch (e) { await page.screenshot({ path: `${S}/fail.png` }).catch(() => {}); check("unexpected error", false, e.message.split("\n")[0]); }
finally { await browser.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1); }
