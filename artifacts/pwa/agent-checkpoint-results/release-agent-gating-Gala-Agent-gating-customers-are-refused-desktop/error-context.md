# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: release\agent-gating.spec.ts >> Gala Agent gating >> customers are refused
- Location: tests\release\agent-gating.spec.ts:23:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:3107/login"
============================================================
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import type { SupabaseClient } from "@supabase/supabase-js";
  3  | import { admin, cleanup, createUser, seedWorkspace, login, BASE } from "../phase1/helpers";
  4  | 
  5  | // Gala Agent is paid: customers can't use it at all, and organizer questions are charged to the workspace's credits —
  6  | // a workspace with no credits gets a "buy credits" response instead of a free answer.
  7  | const db = admin as unknown as SupabaseClient;
  8  | 
  9  | test.describe("Gala Agent gating", () => {
  10 |   let customer: { id: string; email: string }, owner: { id: string; email: string }, ws: string;
  11 |   test.beforeAll(async () => {
  12 |     customer = await createUser("agent-cust");
  13 |     owner = await createUser("agent-org");
  14 |     ws = await seedWorkspace(owner.id, "organizer", "No Credit Org");
  15 |     await db.from("ai_budgets").upsert({ workspace_id: ws, monthly_allowance: 0, hard_cap: true, allow_overage: false, overage_limit: 0 });
  16 |     await db.from("profiles").update({ last_workspace_id: ws }).eq("id", owner.id);
  17 |   });
  18 |   test.afterAll(async () => { await db.from("ai_budgets").delete().eq("workspace_id", ws); await cleanup(); });
  19 | 
  20 |   const ask = (page: import("@playwright/test").Page, scope: string) =>
  21 |     page.request.post(`${BASE}/api/agent/ask`, { headers: { origin: BASE, "content-type": "application/json" }, data: { scope, question: "What should I do next?" } });
  22 | 
  23 |   test("customers are refused", async ({ page }) => {
> 24 |     await login(page, customer.email); await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 });
     |                                                   ^ TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  25 |     const r = await ask(page, "customer");
  26 |     expect(r.status()).toBe(403);
  27 |     expect((await r.json()).error).toMatch(/Organizer and Provider workspaces/);
  28 |   });
  29 | 
  30 |   test("an organizer workspace without credits is told to buy credits", async ({ page }) => {
  31 |     await login(page, owner.email); await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 });
  32 |     const r = await ask(page, "organizer");
  33 |     expect([402, 503]).toContain(r.status()); // 503 only where Azure keys aren't configured
  34 |     if (r.status() === 402) expect((await r.json()).code).toBe("credits");
  35 |   });
  36 | 
  37 |   test("signed-out callers are refused", async ({ request }) => {
  38 |     const r = await request.post(`${BASE}/api/agent/ask`, { headers: { origin: BASE }, data: { scope: "organizer", question: "hello there" } });
  39 |     expect(r.status()).toBe(401);
  40 |   });
  41 | });
  42 | 
```