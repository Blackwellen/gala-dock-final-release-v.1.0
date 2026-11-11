import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Public pricing (/pricing, blueprint §8; until 2026-11-11 a section of the landing page): every price on the plan cards equals the
// anon-readable plan_prices row Stripe billing uses, for both audiences and both billing periods; annual shows the real saving; the
// switches are keyboard-operable toggle buttons; fees and credit packs show; no horizontal overflow at 390 / 1536; the old
// /#pricing anchor lands on /pricing. Read-only.
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
type Row = { kind: "organizer" | "provider"; plan: string; billing_interval: "month" | "year"; price_minor: number; self_serve: boolean };
const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const NAME: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };
const AUDIENCE = { organizer: "Organisers", provider: "Providers" } as const;

async function card(page: Page, plan: string) {
  const c = page.locator("#pricing .lp-plan").filter({ has: page.getByRole("heading", { name: NAME[plan], exact: true }) });
  return { price: (await c.locator(".lp-plan-price").innerText()).replace(/\s+/g, " "), save: await c.locator(".lp-plan-save").allInnerTexts() };
}
const toggle = (page: Page, name: string) => page.locator("#pricing").getByRole("button", { name, exact: true });

for (const width of [390, 1536]) {
  test.describe(`public pricing @ ${width}`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 960 } });

    test("prices equal plan_prices for both audiences and periods; no overflow", async ({ page }) => {
      const { data, error } = await anon.from("plan_prices").select("kind,plan,billing_interval,price_minor,self_serve").eq("active", true);
      expect(error).toBeNull();
      const rows = data as Row[];
      expect(rows.length).toBeGreaterThan(0);
      await page.goto("/pricing");
      await expect(page.locator("#pricing .lp-plan").first()).toBeVisible();
      for (const kind of ["organizer", "provider"] as const) {
        await toggle(page, AUDIENCE[kind]).click();
        for (const yearly of [false, true]) {
          await toggle(page, yearly ? "Annual" : "Monthly").click();
          for (const plan of ["pro", "business", "enterprise"]) {
            const m = rows.find(r => r.kind === kind && r.plan === plan && r.billing_interval === "month");
            const y = rows.find(r => r.kind === kind && r.plan === plan && r.billing_interval === "year");
            if (!m) continue;
            const c = await card(page, plan);
            if (plan === "enterprise" || !m.self_serve) { expect(c.price).toContain(`From ${gbp(m.price_minor)}`); continue; }
            const want = yearly && y ? y : m;
            expect(c.price, `${kind} ${plan} ${yearly ? "year" : "month"}`).toContain(`${gbp(want.price_minor)} ${yearly && y ? "a year" : "a month"} + VAT`);
            if (yearly && y) expect(c.save.join(" ")).toContain(`Save ${Math.round((1 - y.price_minor / (m.price_minor * 12)) * 100)}%`);
            else expect(c.save).toEqual([]);
          }
          expect((await card(page, "starter")).price).toContain("Free");
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });

    test("switches are keyboard-operable toggle buttons; fees and credit packs show; /#pricing lands on /pricing", async ({ page }) => {
      await page.goto("/pricing");
      const pv = toggle(page, "Providers");
      await pv.focus(); await page.keyboard.press("Enter");
      await expect(pv).toHaveAttribute("aria-pressed", "true");
      const yr = toggle(page, "Annual");
      await yr.focus(); await page.keyboard.press("Space");
      await expect(yr).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#pricing .lp-plan").first().locator("a")).toHaveAttribute("href", /\/onboarding\/provider/);
      // Transactions matrix: the fee rules from LEGAL, and the live credit packs.
      const tx = page.locator(".gpr-tx");
      await expect(tx).toContainText("£1.00 per paid ticket");
      await expect(tx).toContainText("5% of the face value");
      const { data: packs } = await anon.from("credit_packs").select("credits,price_minor").eq("active", true);
      for (const p of (packs ?? []) as { credits: number | string; price_minor: number }[]) await expect(tx).toContainText(`${Number(p.credits).toLocaleString("en-GB")} credits for ${gbp(p.price_minor)}`);
      // No unverifiable labels on plan cards.
      await expect(page.locator("#pricing .lp-plan", { hasText: /most popular|recommended|best value/i })).toHaveCount(0);
      await page.goto("/#pricing");
      await expect(page).toHaveURL(/\/pricing$/);
    });
  });
}
