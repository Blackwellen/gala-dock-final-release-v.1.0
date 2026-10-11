import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// ORG-016/017: add external crew → assign a shift (clash-checked, pending) → a double booking is flagged.
const name = `E2E Crew ${Date.now()}`;
test.afterAll(async () => { const db = admin(); const { data } = await db.from("crew_members").select("id").eq("name", name); for (const c of data ?? []) { await db.from("shifts").delete().eq("crew_id", c.id); await db.from("crew_members").delete().eq("id", c.id); } });

test("invite crew and assign a shift", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "organizer", "/organizer/team");
  await page.goto("/organizer/team", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Invite people/ }).first().click();
  const inv = page.getByRole("dialog");
  await inv.getByLabel("Full name").fill(name);
  await inv.getByLabel("Email").fill(`e2e.crew.${Date.now()}@example.com`);
  await inv.getByLabel("Role").fill("Stage Technician");
  await inv.getByLabel("Type").selectOption("crew");
  await inv.getByRole("button", { name: /^Add to/ }).click();
  await expect(inv).toBeHidden({ timeout: 20_000 });
  const db = admin();
  const { data: crew } = await db.from("crew_members").select("id,role,status").eq("name", name).single();
  expect(crew!.role).toBe("Stage Technician");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "More add options" }).click();
  await page.getByRole("menuitem", { name: /Assign shift/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Person").selectOption(crew!.id);
  await dlg.getByLabel("Role on the day").fill("Stage Crew");
  await dlg.getByRole("button", { name: /^Assign/ }).click();
  await expect.poll(async () => (await db.from("shifts").select("id,status,role").eq("crew_id", crew!.id)).data?.length ?? 0, { timeout: 20_000 }).toBe(1);
  const { data: sh } = await db.from("shifts").select("status,role,event_id,starts_at,ends_at").eq("crew_id", crew!.id).single();
  expect(sh).toMatchObject({ role: "Stage Crew" });
  expect(["pending", "requested", "offered"]).toContain(sh!.status);

  // Same person, same window → clash warning instead of a silent double booking.
  await page.getByRole("button", { name: "More add options" }).click();
  await page.getByRole("menuitem", { name: /Assign shift/ }).click();
  await dlg.getByLabel("Person").selectOption(crew!.id);
  await dlg.getByLabel("Event").selectOption(sh!.event_id);
  await dlg.getByLabel("Role on the day").fill("Stage Crew");
  await dlg.getByRole("button", { name: /^Assign/ }).click();
  await expect(page.getByRole("button", { name: /Assign anyway/ }).or(page.getByText(/already|clash|double/i).first())).toBeVisible({ timeout: 20_000 });
  expect((await db.from("shifts").select("id").eq("crew_id", crew!.id)).data).toHaveLength(1);
});
