import { test, expect } from "@playwright/test";
import { createUser, login, cleanup, admin } from "../../phase1/helpers";

// W13 (lane B): customer controls not already asserted by the customer suite, on a disposable customer.
// Outcomes are checked in the database (service client used for assertions only).
const sb = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
test.afterAll(async () => { await cleanup(); });

test("task circle marks a plan task done; Discard draft archives the draft plan; Discover save toggles a saved item", async ({ page }) => {
  const u = await createUser("w13cu", "W13 Planner");
  const { data: ev, error } = await sb.from("events").insert({ name: "W13 draft party", owner_id: u.id, management: "consumer", status: "draft", event_type: "birthday", visibility: "private", starts_at: new Date(Date.now() + 40 * 864e5).toISOString() }).select("id").single();
  if (error) throw error;
  const { data: task } = await sb.from("tasks").insert({ event_id: ev.id, owner_id: u.id, title: "Book the cake", status: "todo", due_at: new Date(Date.now() + 5 * 864e5).toISOString() }).select("id").single();

  await login(page, u.email, "/account/events");
  await page.waitForURL(/\/account\/events/);
  await page.getByRole("button", { name: 'Mark "Book the cake" done' }).first().click();
  await expect.poll(async () => (await sb.from("tasks").select("status").eq("id", task.id).single()).data?.status).toBe("done");

  await page.goto(`/plan?step=2&event=${ev.id}`);
  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page).toHaveURL(/\/plan/);
  await expect.poll(async () => (await sb.from("events").select("status").eq("id", ev.id).single()).data?.status).toBe("archived");
  await page.goto("/account/events"); await expect(page.getByText("W13 draft party")).toHaveCount(0);

  await page.goto("/discover");
  // The first Save heart on Discover; mark it so the same element is clicked again after its label flips to "Remove …".
  const heart = page.getByRole("button", { name: /^Save / }).first();
  await heart.evaluate(el => el.setAttribute("data-w13", "heart"));
  await heart.click();
  await expect.poll(async () => (await sb.from("saved_items").select("item_key").eq("user_id", u.id)).data?.length).toBe(1);
  await page.locator('[data-w13="heart"]').click();
  await expect.poll(async () => (await sb.from("saved_items").select("item_key").eq("user_id", u.id)).data?.length).toBe(0);
});
