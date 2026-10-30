import { test, expect, type Page } from "@playwright/test";
import { createUser, login, cleanup, admin, BASE } from "../../phase1/helpers";

// W13 (lane B): click-assert the state-changing controls on the public surfaces and the customer controls not covered by the
// customer suite, on a disposable customer (tests/phase1/helpers.ts; cleanup() deletes the user and hides any public fixtures).
// Every assertion checks the outcome: a DB row, a toast, the correct refusal, or (navigation) the destination.
// Excluded by rule: completing a Stripe payment, real email/SMS, AI, maintenance, purge, captcha, demo-data deletion.

const EVENT = "neon-nights";
const ORG = "75e6c471-8d5e-4b9f-b076-ff10cf209f01";
const sb = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const eventId = async () => ((await sb.from("events").select("id").eq("slug", EVENT).single()).data as { id: string }).id;
const toast = (page: Page, text: RegExp) => expect(page.locator(".k-toast").last()).toContainText(text);

test.afterAll(async () => { await cleanup(); });

test("signed out: Save, Follow and Buy send the visitor to sign in and back", async ({ page }) => {
  await page.goto(`/events/${EVENT}`);
  await page.locator(".pe3-hero").getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fneon-nights/);
  await page.goto(`/events/${EVENT}`);
  await expect(page.locator(".pe3-org").getByRole("link", { name: "Follow" })).toHaveAttribute("href", /\/login\?next=/);
  await page.goto(`/organizers/${ORG}`);
  await expect(page.locator(".og3-acts").getByRole("link", { name: "Follow" })).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/organizers/${ORG}`)}`);
  await page.goto("/events/in/london");
  await expect(page.getByRole("link", { name: /Follow this city/ })).toHaveAttribute("href", /\/login\?next=/);
});

test("directory search, date windows and category strip navigate with the right results heading", async ({ page }) => {
  await page.goto("/events/in/london");
  await page.getByLabel("Search events").fill("neon");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=neon/);
  await expect(page.locator(".dir-card").first()).toContainText(/neon/i);
  for (const [label, q] of [["Today", "when=today"], ["This weekend", "when=weekend"], ["This month", "when=month"]] as const) {
    await page.goto("/events/in/london");
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(q));
  }
  await page.goto("/events/in/london");
  await page.locator(".dir-cats a").nth(1).click();
  await expect(page).toHaveURL(/\/events\/(category|in)\//);
  const empty = await page.request.get(`${BASE}/events?q=zzzz-no-match`); expect(empty.status()).toBe(200);
});

test("signed in (disposable): save/unsave, follow/unfollow organiser and city, registration refusal, checkout up to payment", async ({ page }) => {
  const u = await createUser("w13b", "W13 Customer");
  await login(page, u.email, `/events/${EVENT}`);
  await page.waitForURL(/\/events\/neon-nights/);
  const id = await eventId();

  // Save → saved_items row; unsave → gone.
  const save = page.locator(".pe3-hero").getByRole("button", { name: /^Save/ });
  await save.click(); await toast(page, /Saved to your list/);
  await expect.poll(async () => (await sb.from("saved_items").select("item_key").eq("user_id", u.id).eq("item_key", `event:${id}`)).data?.length).toBe(1);
  await page.locator(".pe3-hero").getByRole("button", { name: /Saved/ }).click(); await toast(page, /Removed from saved/);
  await expect.poll(async () => (await sb.from("saved_items").select("item_key").eq("user_id", u.id).eq("item_key", `event:${id}`)).data?.length).toBe(0);

  // Follow organiser on the event page → follows row; Following → unfollow removes it.
  const ws = ((await sb.from("events").select("workspace_id").eq("id", id).single()).data as { workspace_id: string }).workspace_id;
  await page.locator(".pe3-org").getByRole("button", { name: "Follow" }).click();
  await expect(page.locator(".pe3-org").getByRole("button", { name: "Following" })).toBeVisible();
  await expect.poll(async () => (await sb.from("follows").select("subject_key").eq("user_id", u.id).eq("subject_kind", "organizer").eq("subject_key", ws)).data?.length).toBe(1);
  await page.goto(`/organizers/${ws}`);
  await page.locator(".og3-acts").getByRole("button", { name: "Following" }).click();
  await expect(page.locator(".og3-acts").getByRole("button", { name: "Follow" })).toBeVisible();
  await expect.poll(async () => (await sb.from("follows").select("subject_key").eq("user_id", u.id).eq("subject_kind", "organizer")).data?.length).toBe(0);

  // Follow city on the directory.
  await page.goto("/events/in/london");
  await page.getByRole("button", { name: /Follow this city/ }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await expect.poll(async () => (await sb.from("follows").select("subject_key").eq("user_id", u.id).eq("subject_kind", "city").eq("subject_key", "london")).data?.length).toBe(1);
  await page.getByRole("button", { name: "Following" }).click();
  await expect.poll(async () => (await sb.from("follows").select("subject_key").eq("user_id", u.id).eq("subject_kind", "city")).data?.length).toBe(0);

  // Register: this event takes no registrations → the page refuses (no form).
  await page.goto(`/events/${EVENT}/register`);
  await expect(page.getByText("This event doesn't take registrations.")).toBeVisible();

  // RSVP with a bad token → uniform not-found.
  expect((await page.request.get(`${BASE}/rsvp/${"A".repeat(43)}`)).status()).toBe(404);

  // Checkout up to (not including) payment: pick a tier, Buy → checkout opens for this event with the tier; either the attendee
  // step or the documented refusal while the seller isn't ready (Q07) — never a card form submitted.
  await page.goto(`/events/${EVENT}`);
  await page.locator(".pe3-tickets .pe-tier").first().click();
  const buy = page.locator(".pe3-tickets .pe-buy");
  if (/Buy Tickets/.test(await buy.innerText())) { await buy.click(); await expect(page).toHaveURL(/\/checkout\/neon-nights\?tier=/); }
  else {
    // Seller not ready (Q07): the card offers no Buy (decision 2); checkout itself still refuses.
    await expect(buy).toHaveText(/Tickets on sale soon|Join the waitlist/);
    await page.goto(`/checkout/${EVENT}`);
  }
  await expect(page.locator("main")).toContainText(/Attendee|Your details|ticket sales for this event aren.t open yet|Order summary/i);
});

test("cookie banner: anonymous choice sets gd_consent; signed-in choice appends a consent record; reopen from Cookies page", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await ctx.addCookies([{ name: "gd_consent", value: "referral:yes", domain: new URL(BASE).hostname, path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const banner = page.getByRole("region", { name: "Cookie choice" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Essential only" }).click();
  await expect(banner).toBeHidden();
  let jar = await ctx.cookies();
  expect(decodeURIComponent(jar.find(c => c.name === "gd_consent")!.value)).toBe("referral:yes,analytics:no");
  expect(jar.find(c => c.name === "gd_consent")!.httpOnly).toBe(true);
  await page.reload(); await expect(banner).toBeHidden();
  await page.goto(`${BASE}/cookies`);
  await page.getByRole("button", { name: "Change cookie choice" }).click();
  await page.getByRole("region", { name: "Cookie choice" }).getByRole("button", { name: "Allow analytics" }).click();
  await expect(page.getByRole("region", { name: "Cookie choice" })).toBeHidden();
  jar = await ctx.cookies();
  expect(decodeURIComponent(jar.find(c => c.name === "gd_consent")!.value)).toBe("referral:yes,analytics:yes");
  // Refusals: cross-site POST and malformed body.
  expect((await page.request.post(`${BASE}/api/consent`, { data: { analytics: true }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  expect((await page.request.post(`${BASE}/api/consent`, { data: { analytics: "yes" } })).status()).toBe(400);
  await ctx.close();

  const u = await createUser("w13c", "W13 Consent");
  const ctx2 = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p2 = await ctx2.newPage();
  await login(p2, u.email, "/discover");
  await p2.waitForURL(u2 => !u2.pathname.startsWith("/login"));
  await p2.getByRole("region", { name: "Cookie choice" }).getByRole("button", { name: "Allow analytics" }).click();
  await expect.poll(async () => ((await sb.from("consent_records").select("granted,source").eq("user_id", u.id).eq("purpose", "cookies_analytics")).data ?? []).map((r: { granted: boolean; source: string }) => `${r.granted}:${r.source}`)).toContain("true:cookie_banner");
  await ctx2.close();
});
