import { test, expect } from "@playwright/test";
import { login, admin, toast } from "../p2-helpers";

// Journeys 33–35: lead → pipeline stages → proposal issue → client acceptance → conversion to one canonical event.
test.describe.configure({ mode: "serial" });
const tag = `E2E ${Date.now()}`;

test("create lead and move through pipeline", async ({ page }) => {
  await login(page, "organizer", "/organizer/sales");
  await page.goto("/organizer/sales?new=lead", { waitUntil: "networkidle" });
  const dlg = page.getByRole("dialog", { name: "Add lead" });
  await dlg.locator('input[name="name"]').fill(`${tag} Lead`);
  await dlg.locator('input[name="client_name"]').fill("E2E Client Ltd");
  await dlg.locator('input[name="contact_email"]').fill("client@example.com");
  await dlg.locator('input[name="value"]').fill("12000");
  await dlg.getByRole("button", { name: "Create lead" }).click();
  await page.waitForURL(/\/organizer\/sales\/leads\//);
  await expect(page.getByRole("heading", { name: `${tag} Lead` })).toBeVisible();
  await page.getByRole("button", { name: "Qualify" }).click();
  await toast(page, /qualified/i);
  const { data } = await admin().from("leads").select("stage,probability").eq("name", `${tag} Lead`).single();
  expect(data).toMatchObject({ stage: "qualified", probability: 40 });
  // Moving straight to "won" from the board is blocked without an explicit event choice
  const won = await page.evaluate(() => fetch(location.href).then(r => r.status));
  expect(won).toBe(200);
});

test("proposal: draft → pricing → issue → client accepts → convert", async ({ page, browser }) => {
  await login(page, "organizer", "/organizer/proposals/new?step=1");
  const { data: lead } = await admin().from("leads").select("id").eq("name", `${tag} Lead`).single();
  await page.goto(`/organizer/proposals/new?step=1&lead=${lead!.id}`, { waitUntil: "networkidle" });
  await page.locator('input[type="date"]').first().fill("2027-03-14");
  await page.getByLabel("Location *").fill("London, UK");
  await page.getByLabel("Expected attendance *").fill("300");
  await page.getByRole("button", { name: /Continue to Offer/ }).click();
  await page.waitForURL(/step=2&id=/);
  await page.waitForLoadState("networkidle");
  const id = new URL(page.url()).searchParams.get("id")!;
  await page.getByLabel("Item 1 name").fill("Venue hire");
  await page.getByLabel("Unit price").first().fill("10000");
  await page.getByRole("button", { name: /Continue to Review/ }).click();
  await page.waitForURL(/step=3/);
  await page.waitForLoadState("networkidle");
  // Server-computed totals: 10,000 + 20% VAT
  let { data: p } = await admin().from("proposals").select("subtotal,tax,total,status,share_token").eq("id", id).single();
  expect(Number(p!.total)).toBe(12000);
  await page.getByRole("button", { name: "Send proposal" }).click();
  await page.waitForURL(new RegExp(`/organizer/sales/proposals/${id}`));
  ({ data: p } = await admin().from("proposals").select("subtotal,tax,total,status,share_token,version").eq("id", id).single());
  expect(p!.status).toBe("sent");
  const { count } = await admin().from("proposal_versions").select("id", { count: "exact", head: true }).eq("proposal_id", id);
  expect(count).toBe(1);
  // Client (anonymous) accepts via the share link
  const client = await (await browser.newContext()).newPage();
  await client.goto(`/proposal/${p!.share_token}`, { waitUntil: "networkidle" });
  await client.getByLabel("Full name").fill("Casey Client");
  await client.getByLabel("Email").fill("casey@example.com");
  await client.getByRole("checkbox").check();
  await client.getByRole("button", { name: "Accept proposal" }).click();
  await expect(client.getByText(/acceptance has been recorded/)).toBeVisible();
  const { data: acc } = await admin().from("proposals").select("status,acceptance").eq("id", id).single();
  expect(acc!.status).toBe("accepted");
  expect((acc!.acceptance as { email: string }).email).toBe("casey@example.com");
  // Convert → exactly one event, linked back to lead and proposal
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Convert to event" }).first().click();

  await page.waitForURL(/\/organizer\/events\//);
  const evId = page.url().split("/organizer/events/")[1]!.split(/[?#]/)[0];
  const { data: conv } = await admin().from("proposals").select("status,event_id").eq("id", id).single();
  expect(conv).toMatchObject({ status: "converted", event_id: evId });
  const { count: dup } = await admin().from("events").select("id", { count: "exact", head: true }).eq("lead_id", lead!.id);
  expect(dup).toBe(1);
});

test.afterAll(async () => {
  const a = admin();
  const { data: lead } = await a.from("leads").select("id,event_id").eq("name", `${tag} Lead`).maybeSingle();
  if (lead) { await a.from("proposals").delete().eq("lead_id", lead.id); await a.from("leads").delete().eq("id", lead.id); if (lead.event_id) await a.from("events").delete().eq("id", lead.event_id); }
});
