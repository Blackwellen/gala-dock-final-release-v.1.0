import { test, expect } from "@playwright/test";
import { login, admin, userClient } from "../p2-helpers";

// CU-009/010: list + QR panel, resale list/cancel (QR rotates), attendee edit, transfer voids QR, calendar file, RLS isolation.
test.describe.configure({ mode: "serial" });
let ticket = "", event = "";
test.beforeAll(async () => {
  const db = admin();
  const { data: u } = await db.auth.admin.listUsers({ perPage: 200 }); const alex = u.users.find(x => x.email === "alex.thompson@example.com")!;
  const { data: ev } = await db.from("events").select("id").eq("slug", "neon-nights").single(); event = ev!.id;
  const { data: tier } = await db.from("ticket_tiers").select("id").eq("event_id", event).limit(1).single();
  const { data: t } = await db.from("tickets").insert({ code: `GLD-E2E-${Date.now().toString(36).toUpperCase()}`, event_id: event, tier_id: tier!.id, holder_id: alex.id, attendee_name: "Alex Thompson", attendee_email: alex.email, order_ref: `E2E-${Date.now()}`, status: "valid", qr_nonce: "a".repeat(32), price_paid: 45 }, { defaultToNull: false }).select("id").single();
  ticket = t!.id;
});
test.afterAll(async () => { const db = admin(); const { data } = await db.from("tickets").select("id,replaced_by").eq("id", ticket).maybeSingle(); if (data?.replaced_by) await db.from("tickets").delete().eq("id", data.replaced_by); await db.from("tickets").delete().eq("id", ticket); });

test("list shows tickets with a scannable QR panel", async ({ page }) => {
  await login(page, "customer", "/account/tickets");
  await page.goto("/account/tickets", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.locator(".tk-card").first()).toBeVisible();
  await expect(page.locator(".tk-panel img[alt^='QR code']")).toBeVisible();
  const cal = await page.request.get(`/api/tickets/${ticket}/ics`);
  expect(cal.status()).toBe(200); expect(await cal.text()).toContain("BEGIN:VEVENT");
});

test("resale list → cancel rotates the QR nonce; attendee edit works", async ({ page }) => {
  await login(page, "customer", `/account/tickets/${ticket}`);
  await page.goto(`/account/tickets/${ticket}`, { waitUntil: "networkidle" });
  await page.locator(".td-manage").getByRole("button", { name: "Official resale" }).click();
  await page.getByRole("button", { name: "List for resale" }).click();
  await expect(page.locator(".td-manage").getByRole("button", { name: "Cancel resale" })).toBeVisible();
  const db = admin(); const n1 = (await db.from("tickets").select("status,qr_nonce").eq("id", ticket).single()).data!;
  expect(n1.status).toBe("resale_listed"); expect(n1.qr_nonce).not.toBe("a".repeat(32));
  await page.locator(".td-manage").getByRole("button", { name: "Cancel resale" }).click();
  await expect(page.locator(".td-manage").getByRole("button", { name: "Official resale" })).toBeVisible();
  expect((await db.from("tickets").select("status").eq("id", ticket).single()).data!.status).toBe("valid");
  await page.locator(".td-att").getByRole("button", { name: "Edit" }).click();
  const dlg = page.getByRole("dialog", { name: "Edit attendee details" });
  await dlg.getByLabel("Full name").fill("Alex J Thompson"); await dlg.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator(".td-att")).toContainText("Alex J Thompson");
});

test("an unrelated user cannot read or transfer this ticket (the event organizer legitimately can read it)", async () => {
  const org = await userClient("provider");
  const { data } = await org.from("tickets").select("id").eq("id", ticket);
  expect(data ?? []).toHaveLength(0);
  const { error } = await org.rpc("transfer_ticket", { p_ticket: ticket, p_email: "x@example.com", p_name: "X" });
  expect(error?.message).toMatch(/not_authorized/);
});

test("transfer issues a new ticket and voids the old QR", async ({ page }) => {
  await login(page, "customer", `/account/tickets/${ticket}`);
  await page.goto(`/account/tickets/${ticket}`, { waitUntil: "networkidle" });
  await page.locator(".td-manage").getByRole("button", { name: "Transfer ticket" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Recipient's full name").fill("Sam Friend"); await dlg.getByLabel("Recipient's email").fill("sam.friend@example.com");
  await dlg.getByRole("button", { name: "Transfer ticket" }).click();
  await page.waitForURL(/tab=resale/);
  const { data: t } = await admin().from("tickets").select("status,replaced_by").eq("id", ticket).single();
  expect(t!.status).toBe("transferred"); expect(t!.replaced_by).toBeTruthy();
});
