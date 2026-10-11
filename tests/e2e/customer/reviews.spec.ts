import { test, expect } from "@playwright/test";
import { login, admin, userClient } from "../p2-helpers";

// CU-012: only completed bookings are reviewable; submit → published + listing count updated; future bookings refused.
let item = "", listing = "", before = 0, rating = 0;
test.beforeAll(async () => {
  const db = admin();
  // Demo customer only — never touch copies attached to real accounts (settings.demo_copy_of).
  const { data: us } = await db.auth.admin.listUsers({ perPage: 200 }); const alex = us.users.find(u => u.email === "alex.thompson@example.com")!.id;
  const { data } = await db.from("build_items").select("id,listing_id,events!inner(name,owner_id)").eq("events.name", "Rooftop Anniversary Dinner").eq("events.owner_id", alex).eq("title", "The Loft London").limit(1).single();
  item = data!.id; listing = data!.listing_id!;
  await db.from("reviews").delete().eq("build_item_id", item);
  const l = (await db.from("listings").select("review_count,rating").eq("id", listing).single()).data!; before = l.review_count; rating = Number(l.rating);
});
test.afterAll(async () => { const db = admin(); await db.from("reviews").delete().eq("build_item_id", item); await db.from("listings").update({ review_count: before, rating }).eq("id", listing); });

test("write and submit a review for a completed booking", async ({ page }) => {
  await login(page, "customer", `/account/reviews?item=${item}`);
  await page.goto(`/account/reviews?item=${item}`, { waitUntil: "networkidle" });
  const form = page.locator("#write");
  await expect(form.getByRole("button", { name: /Submit review/ })).toBeDisabled();
  for (const g of ["Overall experience", "Quality", "Communication", "Value for money", "Reliability / Punctuality"]) await form.getByRole("radiogroup", { name: g }).getByRole("radio", { name: /^5 stars/ }).click();
  await form.locator("#rv-body").fill("Stunning rooftop views, attentive staff and everything ran exactly to plan.");
  await form.locator(".rv-confirm input").check();
  await form.getByRole("button", { name: /Submit review/ }).click();
  await page.waitForURL(/tab=submitted/);
  const db = admin();
  const { data: r } = await db.from("reviews").select("rating,status,ratings").eq("build_item_id", item).single();
  expect(r).toMatchObject({ rating: 5, status: "published" });
  expect((await db.from("listings").select("review_count").eq("id", listing).single()).data!.review_count).toBe(before + 1);
});

test("future (not yet completed) bookings cannot be reviewed", async () => {
  const db = admin();
  const { data: fut } = await db.from("build_items").select("id,events!inner(slug)").eq("events.slug", "alex-taylor-wedding").eq("status", "confirmed").limit(1).single();
  const c = await userClient("customer");
  const { error } = await c.rpc("submit_review", { p_item: fut!.id, p_rating: 5, p_ratings: {}, p_body: "This is a long enough review body.", p_photos: [] });
  expect(error?.message).toMatch(/event_not_ended/);
});
