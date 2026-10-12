import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, login, BASE } from "../phase1/helpers";

// Gala Agent is paid: customers can't use it at all, and organizer questions are charged to the workspace's credits —
// a workspace with no credits gets a "buy credits" response instead of a free answer.
const db = admin as unknown as SupabaseClient;

test.describe("Gala Agent gating", () => {
  let customer: { id: string; email: string }, owner: { id: string; email: string }, ws: string;
  test.beforeAll(async () => {
    customer = await createUser("agent-cust");
    owner = await createUser("agent-org");
    ws = await seedWorkspace(owner.id, "organizer", "No Credit Org");
    await db.from("ai_budgets").upsert({ workspace_id: ws, monthly_allowance: 0, hard_cap: true, allow_overage: false, overage_limit: 0 });
    await db.from("profiles").update({ last_workspace_id: ws }).eq("id", owner.id);
  });
  test.afterAll(async () => { await db.from("ai_budgets").delete().eq("workspace_id", ws); await cleanup(); });

  const ask = (page: import("@playwright/test").Page, scope: string) =>
    page.request.post(`${BASE}/api/agent/ask`, { headers: { origin: BASE, "content-type": "application/json" }, data: { scope, question: "What should I do next?" } });

  test("customers are refused", async ({ page }) => {
    await login(page, customer.email); await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 });
    const r = await ask(page, "customer");
    expect(r.status()).toBe(403);
    expect((await r.json()).error).toMatch(/Organizer and Provider workspaces/);
  });

  test("an organizer workspace without credits is told to buy credits", async ({ page }) => {
    await login(page, owner.email); await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 });
    const r = await ask(page, "organizer");
    expect([402, 503]).toContain(r.status()); // 503 only where Azure keys aren't configured
    if (r.status() === 402) expect((await r.json()).code).toBe("credits");
  });

  test("signed-out callers are refused", async ({ request }) => {
    const r = await request.post(`${BASE}/api/agent/ask`, { headers: { origin: BASE }, data: { scope: "organizer", question: "hello there" } });
    expect(r.status()).toBe(401);
  });
});
