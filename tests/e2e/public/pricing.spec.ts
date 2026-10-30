import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Public pricing (landing #pricing): every price on the cards equals the anon-readable plan_prices row Stripe billing uses, for both
// audiences and both billing periods; yearly shows the real saving; the switches are keyboard-operable toggle buttons; no horizontal
// overflow at 390 / 1536; /pricing lands on the section. Read-only.
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
type Row = { kind: "organizer" | "provider"; plan: string; billing_interval: "month" | "year"; price_minor: number; self_serve: boolean };
const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const NAME: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };

async function card(page: Page, plan: string) {
  const c = page.locator("#pricing .lp-plan").filter({ has: page.getByRole("heading", { name: NAME[plan], exact: true }) });
  return { price: (await c.locator(".lp-plan-price").innerText()).replace(/\s+/g, " "), save: await c.locator(".lp-plan-save").allInnerTexts() };
}

for (const width of [390, 1536]) {
  test.describe(`public pricing @ ${width}`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 960 } });

    test("prices equal plan_prices for both audiences and periods; no overflow", async ({ page }) => {
      const { data, error } = await anon.from("plan_prices").select("kind,plan,billing_interval,price_minor,self_serve").eq("active", true);
      expect(error).toBeNull();
      const rows = data as Row[];
      expect(rows.length).toBeGreaterThan(0);
      await page.goto("/#pricing");
      await expect(page.locator("#pricing")).toBeVisible();
      for (const kind of ["organizer", "provider"] as const) {
        await page.getByRole("button", { name: kind === "organizer" ? "Organizers" : "Venues & suppliers" }).click();
        for (const yearly of [false, true]) {
          await page.getByRole("button", { name: yearly ? "Yearly" : "Monthly" }).click();
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

    test("switches are keyboard-operable toggle buttons; fees and credit panels show; /pricing lands on the section", async ({ page }) => {
      await page.goto("/#pricing");
      const vs = page.getByRole("button", { name: "Venues & suppliers" });
      await vs.focus(); await page.keyboard.press("Enter");
      await expect(vs).toHaveAttribute("aria-pressed", "true");
      const yr = page.getByRole("button", { name: "Yearly" });
      await yr.focus(); await page.keyboard.press("Space");
      await expect(yr).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#pricing .lp-plan").first().locator("a")).toHaveAttribute("href", /\/onboarding\/provider/);
      await expect(page.locator("#pricing .lp-price-fees h3", { hasText: "Transaction fees" })).toBeVisible();
      const { data: packs } = await anon.from("credit_packs").select("credits").eq("active", true);
      if ((packs ?? []).length) await expect(page.locator("#pricing .lp-price-fees h3", { hasText: "credit top-ups" })).toBeVisible();
      await page.goto("/pricing");
      await expect(page).toHaveURL(/\/#pricing$/);
    });
  });
}
