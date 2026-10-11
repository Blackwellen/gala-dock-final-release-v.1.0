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

test("accept quote → deposit payment order + Stripe Checkout (booking confirms on webhook)", async ({ page }) => {
  await admin().from("build_items").update({ status: "quoted", amount: 1000, deposit: 300, price_basis: "quote" }).eq("id", item);
  await login(page, "customer", `/account/events/${ev}/book?item=${item}&step=2`);
  await page.goto(`/account/events/${ev}/book?item=${item}&step=2`, { waitUntil: "networkidle" });
  await expect(page.getByRole("radio", { name: /Accept quote & book/ })).toHaveAttribute("aria-checked", "true");
  await page.locator(".bk-agree input").check();
  await page.getByRole("button", { name: /Book & pay £300 deposit/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  const db = admin();
  const { data: po } = await db.from("payment_orders").select("kind,status,amount_minor,currency,stripe_checkout_session,commission").eq("build_item_id", item).order("created_at", { ascending: false }).limit(1).single();
  expect(po).toMatchObject({ kind: "deposit", amount_minor: 30000, currency: "GBP" });
  expect(po!.stripe_checkout_session).toMatch(/^cs_/);
  // Nothing is confirmed or recorded as paid until Stripe confirms the payment.
  const { data: b } = await db.from("build_items").select("status").eq("id", item).single();
  expect(b!.status).toBe("quoted");
  const { count } = await db.from("payments").select("id", { count: "exact", head: true }).eq("build_item_id", item).eq("status", "paid");
  expect(count).toBe(0);
});

test("only the event owner can submit or accept bookings", async () => {
  const org = await userClient("organizer");
  const r1 = await org.rpc("customer_save_booking", { p_item: item, p_requirements: {}, p_option: "request", p_submit: true });
  expect(r1.error?.message).toMatch(/not_authorized/);
  const r2 = await org.rpc("customer_accept_quote", { p_item: item, p_payment_ref: "pi_fake" });
  expect(r2.error?.message).toMatch(/not_authorized/);
  expect(listing).toBeTruthy();
});
