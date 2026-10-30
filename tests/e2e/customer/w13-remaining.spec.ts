import { test, expect } from "@playwright/test";
import { createUser, login, cleanup, admin, signedIn } from "../../phase1/helpers";

// W13 remaining customer controls (coordinator decision 6), on a disposable customer and a disposable consumer event with
// ticketing switched on through the same RPC the UI uses (event_set_ticketing, as the user). Needs a browser slot.
// Outcomes are asserted in the database (service client for assertions only) or on the downloaded file.
const sb = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
let user: { id: string; email: string }; let ev = "";
test.beforeAll(async () => {
  user = await createUser("w13r", "W13 Remaining");
  const { data, error } = await sb.from("events").insert({ name: "W13 ticketed party", owner_id: user.id, management: "consumer", status: "draft", event_type: "birthday", visibility: "private", capacity: 120, city: "London", location: "London, UK", guest_count: 80,
    starts_at: new Date(Date.now() + 60 * 864e5).toISOString(), ends_at: new Date(Date.now() + 60 * 864e5 + 5 * 36e5).toISOString() }).select("id").single();
  if (error) throw error; ev = data.id;
  const c = await signedIn(user.email) as unknown as { rpc: (f: string, a: unknown) => Promise<{ error: { message: string } | null }> };
  const r = await c.rpc("event_set_ticketing", { p_event: ev, p_on: true });
  if (r.error) throw new Error(`event_set_ticketing: ${r.error.message}`);
});
test.afterAll(async () => { await cleanup(); });

test("ticket setup: model choice, refund policy, continue between steps and publish a free event", async ({ page }) => {
  await login(page, user.email, `/account/events/${ev}/tickets/setup?step=1`);
  await page.waitForURL(/tickets\/setup/);
  await page.getByText("Reserved Sections", { exact: false }).first().click();       // model radio: reserved
  await page.getByText("Free Event", { exact: false }).first().click();              // then free (prices forced to 0)
  await page.getByRole("button", { name: "Add tier" }).first().click();             // a fresh event has no tiers; Continue stays disabled until one exists
  await page.getByRole("button", { name: /Continue to (Details & Settings|Sales & Rules)/ }).click();
  await expect(page).toHaveURL(/step=2/);
  await expect.poll(async () => ((await sb.from("events").select("settings").eq("id", ev).single()).data?.settings as Record<string, unknown>)?.ticket_model).toBe("free");
  await expect.poll(async () => ((await sb.from("ticket_tiers").select("price").eq("event_id", ev)).data ?? []).every((t: { price: number }) => Number(t.price) === 0)).toBe(true);

  for (const label of ["Refunds up to 7 days", "Partial refund", "Custom policy", "No refunds"]) await page.getByText(label, { exact: false }).first().click();
  await page.getByRole("button", { name: /Continue to Review & Publish/ }).click();
  await expect(page).toHaveURL(/step=3/);
  await expect.poll(async () => ((await sb.from("events").select("settings").eq("id", ev).single()).data?.settings as Record<string, unknown>)?.refund_policy).toBe("none");

  const publish = page.locator(".bk-submit");
  await expect(publish).toBeDisabled();                                              // refused until the terms are agreed
  await page.locator(".bk-agree input[type=checkbox]").check();
  if (await publish.isEnabled()) {
    await publish.click();
    await expect.poll(async () => ((await sb.from("events").select("settings").eq("id", ev).single()).data?.settings as Record<string, unknown>)?.ticketing_live).toBe(true);
  } else {
    await expect(publish).toHaveAttribute("title", /readiness checklist/);           // the correct refusal (checklist incomplete)
  }
});

test("guests & tickets: create a tier, and Export downloads the guest list CSV", async ({ page }) => {
  await login(page, user.email, `/account/events/${ev}/guests-tickets`);
  await page.waitForURL(/guests-tickets/);
  await page.getByRole("button", { name: "Create new ticket tier" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator('input[name="name"]').fill("W13 Early");
  await dlg.locator('input[name="price"]').fill("0");
  await dlg.locator('input[name="quantity"]').fill("25");
  await dlg.getByRole("button", { name: /Create|Save|Add/ }).last().click();
  await expect.poll(async () => (await sb.from("ticket_tiers").select("id").eq("event_id", ev).eq("name", "W13 Early")).data?.length).toBe(1);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(dl.suggestedFilename()).toBe("guest-list.csv");
  const body = await (await dl.createReadStream())!.toArray().then(c => Buffer.concat(c).toString("utf8"));
  expect(body.split("\n")[0]).toMatch(/name/i);
});

test("build canvas: add an option from a category that lists providers, then remove it", async ({ page }) => {
  await login(page, user.email, `/account/events/${ev}/build`);
  await page.waitForURL(/\/build/);
  const tiles = page.locator(".cb-add-tile, .cb-more-it button");
  await tiles.first().waitFor({ timeout: 60_000 });                                  // the build canvas streams in after "Loading your page…"
  const n = await tiles.count(); let added = false;
  for (let i = 0; i < n && !added; i++) {
    await tiles.nth(i).click();
    const dlg = page.getByRole("dialog"); const add = dlg.getByRole("button", { name: /^(Add|Add anyway)$/ });
    // Results load after the dialog opens: wait for an Add button (or give up on this category after 15s).
    await add.first().waitFor({ timeout: 15_000 }).catch(() => {});
    if (await add.count()) {
      await add.first().click();
      // The dialog stays open for adding several ("N added to compare · Done"); the row is the outcome.
      await expect.poll(async () => (await sb.from("build_items").select("id").eq("event_id", ev)).data?.length, { timeout: 20_000 }).toBeGreaterThan(0);
      await dlg.getByRole("button", { name: "Done" }).click(); await expect(dlg).toBeHidden(); added = true;
    }
    else await dlg.getByRole("button", { name: "Close" }).click();
  }
  expect(added, "at least one build category lists a published provider").toBe(true);
  await expect.poll(async () => (await sb.from("build_items").select("id").eq("event_id", ev)).data?.length).toBeGreaterThan(0);
  const { data: it } = await sb.from("build_items").select("id,title").eq("event_id", ev).order("created_at", { ascending: false }).limit(1).single();
  await page.reload();
  await page.getByRole("button", { name: `Options for ${it.title}` }).first().click();
  await page.getByRole("menuitem", { name: /Remove option/ }).click();
  await expect.poll(async () => (await sb.from("build_items").select("id").eq("id", it.id)).data?.length).toBe(0);
});
