import { test, expect } from "@playwright/test";
import { login, admin, userClient, eventId } from "../p2-helpers";

// CU-W02: requirements → booking request (no charge) → provider sees requirements; quote → accept & pay deposit → confirmed + payments + provider job.
test.describe.configure({ mode: "serial" });
let ev = "", item = "", listing = "";

test.beforeAll(async () => {
  const db = admin(); ev = await eventId("alex-taylor-wedding");
  const { data: used } = await db.from("build_items").select("listing_id").eq("event_id", ev);
  const { data: l } = await db.from("listings").select("id,name,image").eq("published", true).eq("kind", "service").not("id", "in", `(${(used ?? []).map(u => u.listing_id).filter(Boolean).join(",") || "00000000-0000-0000-0000-000000000000"})`).limit(1).single();
  listing = l!.id;
  const { data: it } = await db.from("build_items").insert({ event_id: ev, listing_id: l!.id, category: "extras", title: `${l!.name}`, package: "E2E package", scope: "", image: l!.image, amount: 1000, price_basis: "estimate", status: "suggested", role: "primary", sort: 99 }).select("id").single();
  item = it!.id;
});
test.afterAll(async () => {
  const db = admin();
  await db.from("payments").delete().eq("build_item_id", item);
  await db.from("transactions").delete().eq("source_id", item);
  await db.from("provider_jobs").delete().eq("build_item_id", item);
  const { data: b } = await db.from("build_items").select("request_id").eq("id", item).maybeSingle();
  await db.from("build_items").delete().eq("id", item);
  if (b?.request_id) await db.from("provider_requests").delete().eq("id", b.request_id);
});

test("requirements → booking request sends to provider without charging", async ({ page }) => {
  await login(page, "customer", `/account/events/${ev}/book?item=${item}&step=1`);
  await page.goto(`/account/events/${ev}/book?item=${item}&step=1`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Booking Request" })).toBeVisible();
  // Required question blocks Continue until answered
  await page.getByRole("button", { name: /Continue to Review/ }).click();
  await expect(page.locator(".bk-err").first()).toBeVisible();
  await page.locator(".bk-q").first().locator(".bk-opt").first().click();
  await page.locator("#bk-notes").fill("Lift access at the rear entrance.");
  await page.getByRole("button", { name: /Continue to Review/ }).click();
  await page.waitForURL(/step=2/);
  await expect(page.getByRole("radio", { name: /Send a booking request/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Submit Booking Request/ }).click();
  await expect(page.locator(".k-toast").last()).toContainText(/agree/i);
  await page.locator(".bk-agree input").check();
  await page.getByRole("button", { name: /Submit Booking Request/ }).click();
  await page.waitForURL(/step=3/);
  await expect(page.getByRole("heading", { name: /Request sent/ })).toBeVisible();
  const db = admin();
  const { data: b } = await db.from("build_items").select("status,response_deadline,request_id").eq("id", item).single();
  expect(b!.status).toBe("sent"); expect(b!.response_deadline).toBeTruthy();
  const { data: pr } = await db.from("provider_requests").select("status,requirements").eq("id", b!.request_id!).single();
  expect(pr!.status).toBe("sent");
  expect(pr!.requirements).toMatchObject({ option: "request", quote_requested: true, notes: "Lift access at the rear entrance." });
  const { count } = await db.from("payments").select("id", { count: "exact", head: true }).eq("build_item_id", item);
  expect(count).toBe(0);
});

test("accept quote → deposit via Stripe Checkout → booking confirmed on return", async ({ page }) => {
  await admin().from("build_items").update({ status: "quoted", amount: 1000, deposit: 300, price_basis: "quote" }).eq("id", item);
  await login(page, "customer", `/account/events/${ev}/book?item=${item}&step=2`);
  await page.goto(`/account/events/${ev}/book?item=${item}&step=2`, { waitUntil: "networkidle" });
  await expect(page.getByRole("radio", { name: /Accept quote & book/ })).toHaveAttribute("aria-checked", "true");
  await page.locator(".bk-agree input").check();
  await page.getByRole("button", { name: /Book & pay £300 deposit/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  const db = admin();
  const { data: po } = await db.from("payment_orders").select("kind,status,amount_minor,customer_fee_minor,currency,stripe_checkout_session,commission").eq("build_item_id", item).order("created_at", { ascending: false }).limit(1).single();
  // Customer booking admin fee: 2.5% (min £1) on top of the deposit, charged as its own Stripe line.
  expect(po).toMatchObject({ kind: "deposit", amount_minor: 30000, customer_fee_minor: 750, currency: "GBP" });
  expect(po!.stripe_checkout_session).toMatch(/^cs_/);
  // Nothing is confirmed or recorded as paid until Stripe confirms the payment.
  const { data: b } = await db.from("build_items").select("status").eq("id", item).single();
  expect(b!.status).toBe("quoted");
  const { count } = await db.from("payments").select("id", { count: "exact", head: true }).eq("build_item_id", item).eq("status", "paid");
  expect(count).toBe(0);

  // Pay on Stripe's hosted page with the test card. On return the server verifies the session with Stripe and confirms
  // the booking — no webhook needed (works locally without `stripe listen`).
  test.setTimeout(180_000);
  // Checkout lists payment methods as radio rows; select Card to reveal the card fields.
  await page.locator("[data-testid=card-accordion-item]").or(page.getByText("Card", { exact: true })).first().click({ timeout: 30_000 });
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  const nameField = page.locator("#billingName"); if (await nameField.count()) await nameField.fill("Alex Thompson");
  const zip = page.locator("#billingPostalCode"); if (await zip.isVisible().catch(() => false)) await zip.fill("SE1 2AB");
  const country = page.locator("#billingCountry"); if (await country.isVisible().catch(() => false)) await country.selectOption("GB").catch(() => {});
  const save = page.locator("#enableStripePass"); if (await save.isChecked().catch(() => false)) await save.uncheck();
  await page.locator("button[type=submit]").first().click();
  await page.waitForURL(/\/payments\/PO-/, { timeout: 90_000 });
  await expect.poll(async () => (await db.from("build_items").select("status").eq("id", item).single()).data?.status, { timeout: 30_000 }).toBe("confirmed");
  const { data: paid } = await db.from("payment_orders").select("status,stripe_payment_intent").eq("build_item_id", item).order("created_at", { ascending: false }).limit(1).single();
  expect(["payment_succeeded", "protected_pending_delivery"]).toContain(paid!.status);
  expect(paid!.stripe_payment_intent).toMatch(/^pi_/);
  await expect(page.getByText(/paid|succeeded|protected/i).first()).toBeVisible();

  // Return-path reconciliation on its own: simulate a webhook that never arrives by putting the order back to pending,
  // then reload the return page — the server re-checks the session with Stripe and applies it (idempotently).
  const { data: po2 } = await db.from("payment_orders").select("reference").eq("build_item_id", item).order("created_at", { ascending: false }).limit(1).single();
  await db.from("payment_orders").update({ status: "payment_pending" }).eq("reference", po2!.reference);
  await page.goto(`/payments/${po2!.reference}`, { waitUntil: "load" });
  await expect.poll(async () => (await db.from("payment_orders").select("status").eq("reference", po2!.reference).single()).data?.status, { timeout: 30_000 }).not.toBe("payment_pending");
  const { data: po3 } = await db.from("payment_orders").select("status").eq("reference", po2!.reference).single();
  expect(["payment_succeeded", "protected_pending_delivery"]).toContain(po3!.status);
});

test("only the event owner can submit or accept bookings", async () => {
  const org = await userClient("organizer");
  const r1 = await org.rpc("customer_save_booking", { p_item: item, p_requirements: {}, p_option: "request", p_submit: true });
  expect(r1.error?.message).toMatch(/not_authorized/);
  const r2 = await org.rpc("customer_accept_quote", { p_item: item, p_payment_ref: "pi_fake" });
  expect(r2.error?.message).toMatch(/not_authorized/);
  expect(listing).toBeTruthy();
});
