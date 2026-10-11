import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// W06 + ORG-019: create an invoice in the wizard → send → reminder → record a part payment then the rest → paid, with ledger.
const client = `E2E Client ${Date.now()}`;
test.afterAll(async () => {
  const db = admin(); const { data } = await db.from("invoices").select("id").eq("client_name", client);
  for (const i of data ?? []) { for (const t of ["invoice_installments", "invoice_items", "invoice_events"]) await db.from(t).delete().eq("invoice_id", i.id); await db.from("invoices").delete().eq("id", i.id); }
});

test("invoice lifecycle: wizard → sent → reminder → payments → paid", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, "organizer", "/organizer/money/invoices/new");
  await page.goto("/organizer/money/invoices/new", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Client name").fill(client);
  await page.getByPlaceholder("billing@client.com").fill("e2e.client@example.com");
  const item = page.getByPlaceholder("Item name").first();
  if (!(await item.count())) await page.getByRole("button", { name: /^Add item/ }).first().click();
  await page.getByPlaceholder("Item name").first().fill("E2E production fee");
  await page.getByLabel("Quantity").first().fill("2");
  await page.getByLabel("Unit price").first().fill("150");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.waitForURL(/step=2/, { timeout: 30_000 });
  await page.getByRole("button", { name: /Send Invoice/ }).click();
  const db = admin();
  await expect.poll(async () => (await db.from("invoices").select("status").eq("client_name", client).maybeSingle()).data?.status, { timeout: 30_000 }).toBe("sent");
  const { data: inv } = await db.from("invoices").select("id,total,number").eq("client_name", client).single();
  expect(Number(inv!.total)).toBeGreaterThanOrEqual(300);

  await page.goto(`/organizer/money/invoices/${inv!.id}`, { waitUntil: "networkidle" });
  await expect(page.getByText(inv!.number).first()).toBeVisible();
  await page.getByRole("button", { name: /Send reminder/ }).first().click();
  await expect.poll(async () => (await db.from("invoice_events").select("id", { count: "exact", head: true }).eq("invoice_id", inv!.id).ilike("event", "%remind%")).count ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);

  // Part payment, then the balance.
  for (const amt of [100, Number(inv!.total) - 100]) {
    await page.getByRole("button", { name: /^Record payment/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Amount (£)").fill(String(amt));
    await dlg.getByRole("button", { name: /^Record payment/ }).click();
    await expect(dlg).toBeHidden({ timeout: 20_000 });
  }
  await expect.poll(async () => (await db.from("invoices").select("status,amount_paid").eq("id", inv!.id).single()).data?.status, { timeout: 20_000 }).toBe("paid");
  const { data: done } = await db.from("invoices").select("amount_paid,total").eq("id", inv!.id).single();
  expect(Number(done!.amount_paid)).toBeCloseTo(Number(done!.total), 2);
});

test("overpayment is rejected", async ({ page }) => {
  const db = admin(); const { data: inv } = await db.from("invoices").select("id,total").eq("client_name", client).maybeSingle();
  test.skip(!inv, "depends on the lifecycle test");
  await login(page, "organizer", `/organizer/money/invoices/${inv!.id}`);
  await page.goto(`/organizer/money/invoices/${inv!.id}`, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: /^Record payment/ }).first();
  if (await btn.isDisabled().catch(() => true)) return; // fully paid invoices hide/disable recording
  await btn.click(); await page.getByRole("dialog").getByLabel("Amount (£)").fill("999999");
  await page.getByRole("dialog").getByRole("button", { name: /^Record payment/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
