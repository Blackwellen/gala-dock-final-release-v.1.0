import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q07 P1: public invoice pay links. HTTP/API level only — renders the page, never submits the pay form, never opens Stripe Checkout.
// Tokens: 24 hex (column default, every link sent before the fix), 36 hex (ensure_invoice_token). invoice_by_token is service-role only.

const db = admin as unknown as SupabaseClient;
test.describe.configure({ mode: "serial" });

test.describe("Q07 invoice pay links", () => {
  let ws: string; let owner: { id: string; email: string };
  const tokens = { legacy: randomBytes(12).toString("hex"), current: randomBytes(18).toString("hex"), draft: randomBytes(12).toString("hex") };
  const numbers: Record<string, string> = {};

  test.beforeAll(async () => {
    owner = await createUser("q07-pay");
    ws = await seedWorkspace(owner.id, "organizer", "Q07 Pay Link Org");
    for (const [k, token] of Object.entries(tokens)) {
      numbers[k] = `Q7PL-${randomBytes(3).toString("hex").toUpperCase()}`;
      const r = await db.from("invoices").insert({ workspace_id: ws, number: numbers[k], client_name: "QA Pay Client", client_email: "qa.pay@example.com",
        currency: "GBP", status: k === "draft" ? "draft" : "sent", subtotal: 80, tax: 0, total: 80, amount_paid: 0, payment_token: token });
      expect(r.error).toBeNull();
    }
  });

  test.afterAll(async () => {
    await db.from("invoices").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("a 24-hex legacy token and a 36-hex token both render 200 with the invoice", async () => {
    for (const k of ["legacy", "current"] as const) {
      const res = await fetch(`${BASE}/pay/${tokens[k]}`);
      expect(res.status, k).toBe(200);
      const html = await res.text();
      expect(html).toContain(numbers[k]);
      expect(html).toContain("Q07 Pay Link Org");
    }
  });

  test("unknown, malformed and draft tokens all give the same 404", async () => {
    const visible = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const probes = [randomBytes(12).toString("hex"), randomBytes(18).toString("hex"), tokens.legacy.toUpperCase(), `${tokens.legacy}x`, "not-a-token", tokens.draft];
    const bodies: string[] = [];
    for (const p of probes) {
      const res = await fetch(`${BASE}/pay/${encodeURIComponent(p)}`);
      expect(res.status, p).toBe(404);
      bodies.push(visible(await res.text()));
    }
    expect(new Set(bodies).size, "404 bodies must not distinguish unknown from malformed").toBe(1);
  });

  test("invoice_by_token is not callable by a signed-in or anonymous client", async () => {
    const user = await signedIn(owner.email);
    const r = await user.rpc("invoice_by_token", { p_token: tokens.legacy });
    expect(r.data ?? null).toBeNull();
    expect(r.error?.code).toMatch(/42501|PGRST202/);
    const { createClient } = await import("@supabase/supabase-js");
    const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const ra = await a.rpc("invoice_by_token", { p_token: tokens.legacy });
    expect(ra.error?.code).toMatch(/42501|PGRST202/);
  });
});
