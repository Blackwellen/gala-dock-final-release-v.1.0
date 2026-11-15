import { test, expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { automaticTaxEnabled } from "../../../src/lib/billing/core";
import { incVatMinor, PLATFORM_FEE_VAT_ADDED, VAT_RATE_NOTE, vatMoney, vatNote, vatPercent, vatPriceLine } from "../../../src/lib/billing/vat-display";

// Public pricing (/pricing, blueprint §8; until 2026-11-11 a section of the landing page): every price on the plan cards equals the
// anon-readable plan_prices row Stripe billing uses, for both audiences and both billing periods; annual shows the real saving; the
// switches are keyboard-operable toggle buttons; fees and credit packs show; no horizontal overflow at 390 / 1536; the old
// /#pricing anchor lands on /pricing. Read-only.
//
// VAT (owner decision 2026-11-15, wording in src/lib/billing/vat-display.ts): with BILLING_AUTOMATIC_TAX on (production) every
// plan / upgrade-path / credit-pack price shows "£49 a month + VAT" AND "£58.80 inc. VAT" (UK rate, integer pennies) plus the
// UK-rate note; with it off no such price says "+ VAT" and the note says VAT isn't added. The browser tests follow whichever state
// the dev server runs in (it reads the same .env files as this runner; override with BILLING_AUTOMATIC_TAX=on|off for both):
//   BILLING_AUTOMATIC_TAX=on  npx playwright test tests/e2e/public/pricing.spec.ts   (server started with the same value)
//   BILLING_AUTOMATIC_TAX=off npx playwright test tests/e2e/public/pricing.spec.ts
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
type Row = { kind: "organizer" | "provider"; plan: string; billing_interval: "month" | "year"; price_minor: number; self_serve: boolean };
const NAME: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };
const AUDIENCE = { organizer: "Organisers", provider: "Providers" } as const;
const VAT_ON = automaticTaxEnabled();
const SUFFIX = VAT_ON ? " + VAT" : "";
const inc = (minor: number) => `${vatMoney(incVatMinor(minor))} inc. VAT`;
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

async function card(page: Page, plan: string) {
  const c = page.locator("#pricing .lp-plan").filter({ has: page.getByRole("heading", { name: NAME[plan], exact: true }) });
  return { price: flat(await c.locator(".lp-plan-price").innerText()), save: await c.locator(".lp-plan-save").allInnerTexts() };
}
const toggle = (page: Page, name: string) => page.locator("#pricing").getByRole("button", { name, exact: true });
/** Elements whose content is wider than their box (a price line spilling out of a card or pack row). */
const overflowing = (page: Page, sel: string) => page.locator(sel).evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));

test.describe("VAT display helper", () => {
  test("inc-VAT at the UK rate in integer pennies, one wording source", () => {
    expect(incVatMinor(4900)).toBe(5880);
    expect(incVatMinor(2500)).toBe(3000);
    expect(incVatMinor(4999)).toBe(5999);   // 5998.8 → half-up
    expect(incVatMinor(3)).toBe(4);         // 3.6
    expect(incVatMinor(1)).toBe(1);         // 1.2
    expect(incVatMinor(0)).toBe(0);
    expect(() => incVatMinor(1.5)).toThrow(); expect(() => incVatMinor(-1)).toThrow();
    expect(vatMoney(5880)).toBe("£58.80"); expect(vatMoney(4900)).toBe("£49"); expect(vatMoney(1490000)).toBe("£14,900");
    expect(vatPriceLine(2500, true)).toBe("£25 + VAT (£30 inc. VAT)"); expect(vatPriceLine(2500, false)).toBe("£25");
    expect(vatPercent(800, true)).toBe("8% + VAT (9.6% inc. VAT)"); expect(vatPercent(800, false)).toBe("8%");
    expect(vatNote(true)).toContain(VAT_RATE_NOTE); expect(VAT_RATE_NOTE).toBe("VAT shown at the UK rate; your invoice uses the rate for your country.");
    expect(vatNote(false)).toMatch(/VAT isn’t added/); expect(vatNote(false)).not.toMatch(/\+ VAT|exclude/);
  });

  test("no hard-coded \"+ VAT\" price wording anywhere in src outside the helper", () => {
    const files = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mjs)$/.test(n) ? [p] : []; });
    const helper = join("src", "lib", "billing", "vat-display.ts");
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (f === helper) continue;
      // Code comments may describe VAT maths ("subtotal + VAT"); only strings and JSX text count.
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
      if (/\+\s?VAT|\(plus VAT\)/.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

for (const width of [390, 1536]) {
  test.describe(`public pricing @ ${width} (VAT ${VAT_ON ? "on" : "off"})`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 960 } });

    test("prices equal plan_prices for both audiences and periods with the VAT wording; no overflow", async ({ page }) => {
      const { data, error } = await anon.from("plan_prices").select("kind,plan,billing_interval,price_minor,self_serve").eq("active", true);
      expect(error).toBeNull();
      const rows = data as Row[];
      expect(rows.length).toBeGreaterThan(0);
      await page.goto("/pricing");
      await expect(page.locator("#pricing .lp-plan").first()).toBeVisible();
      // The server and this runner must agree on the switch, or every assertion below tests the wrong state.
      await expect(page.locator(".gpr-vat"), "dev server BILLING_AUTOMATIC_TAX differs from this runner's").toContainText(vatNote(VAT_ON));
      for (const kind of ["organizer", "provider"] as const) {
        await toggle(page, AUDIENCE[kind]).click();
        for (const yearly of [false, true]) {
          await toggle(page, yearly ? "Annual" : "Monthly").click();
          for (const plan of ["pro", "business", "enterprise"]) {
            const m = rows.find(r => r.kind === kind && r.plan === plan && r.billing_interval === "month");
            const y = rows.find(r => r.kind === kind && r.plan === plan && r.billing_interval === "year");
            if (!m) continue;
            const c = await card(page, plan), what = `${kind} ${plan} ${yearly ? "year" : "month"}`;
            if (plan === "enterprise" || !m.self_serve) {
              expect(c.price, what).toContain(`From ${vatMoney(m.price_minor)} a month${SUFFIX}`);
              if (VAT_ON) expect(c.price, what).toContain(`From ${inc(m.price_minor)}`); else expect(c.price, what).not.toContain("VAT");
              continue;
            }
            const want = yearly && y ? y : m;
            expect(c.price, what).toContain(`${vatMoney(want.price_minor)} ${yearly && y ? "a year" : "a month"}${SUFFIX}`);
            if (VAT_ON) expect(c.price, what).toContain(inc(want.price_minor)); else expect(c.price, what).not.toContain("VAT");
            if (yearly && y) expect(c.save.join(" ")).toContain(`Save ${Math.round((1 - y.price_minor / (m.price_minor * 12)) * 100)}%`);
            else expect(c.save).toEqual([]);
          }
          const starter = await card(page, "starter");
          expect(starter.price).toContain("Free"); expect(starter.price).not.toContain("VAT");
          expect(await overflowing(page, "#pricing .lp-plan-price")).toEqual([]);
        }
      }

      // Provider upgrade path: each paid step shows the same pair as its plan card.
      const steps = page.locator(".gpr-step");
      expect(await steps.count()).toBeGreaterThan(0);
      for (const step of await steps.all()) {
        const name = flat(await step.locator("b").first().innerText()), text = flat(await step.locator(":scope > span").innerText());
        const m = rows.find(r => r.kind === "provider" && NAME[r.plan] === name && r.billing_interval === "month");
        if (!m || text === "Free") continue;
        expect(text, `upgrade path ${name}`).toContain(`${vatMoney(m.price_minor)} a month${SUFFIX}`);
        if (VAT_ON) expect(text).toContain(inc(m.price_minor)); else expect(text).not.toContain("VAT");
      }

      // Credit packs (rail and transactions table).
      const { data: packs } = await anon.from("credit_packs").select("credits,price_minor").eq("active", true);
      for (const p of (packs ?? []) as { credits: number | string; price_minor: number }[]) {
        const credits = `${Number(p.credits).toLocaleString("en-GB")} credits`;
        const li = flat(await page.locator(".gpr-packs li", { hasText: credits }).first().innerText());
        expect(li).toContain(`${vatMoney(p.price_minor)}${SUFFIX}`);
        if (VAT_ON) expect(li).toContain(inc(p.price_minor)); else expect(li).not.toContain("VAT");
        await expect(page.locator(".gpr-tx")).toContainText(`${credits} for ${vatPriceLine(p.price_minor, VAT_ON)}`);
      }
      expect(await overflowing(page, ".gpr-packs li, .gpr-step")).toEqual([]);

      // With VAT off, no price on the page says "+ VAT" (the platform-fee row lives in the closed comparison drawer).
      if (!VAT_ON) expect(await page.locator("#pricing").innerText()).not.toContain("+ VAT");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });

    test("platform fee row in the provider comparison shows the fee with its VAT-inclusive rate", async ({ page }) => {
      await page.goto("/pricing");
      await toggle(page, "Providers").click();
      await page.locator("#pricing .lp-plan").filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) }).getByRole("button", { name: /Compare plans/ }).click();
      const row = page.locator("#gpr-drawer tr", { has: page.getByRole("rowheader", { name: "Platform fee on bookings" }) });
      await expect(row).toBeVisible();
      const cells = (await row.locator("td").allInnerTexts()).map(flat);
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) {
        const m = /^(\d+(?:\.\d+)?)%(?: \+ VAT \((\d+(?:\.\d+)?)% inc\. VAT\))?$/.exec(c);
        expect(m, c).toBeTruthy();
        expect(vatPercent(Math.round(Number(m![1]) * 100), PLATFORM_FEE_VAT_ADDED)).toBe(c);
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
      // Transactions matrix: the fee rules from LEGAL.
      const tx = page.locator(".gpr-tx");
      await expect(tx).toContainText("£1.00 per paid ticket");
      await expect(tx).toContainText("5% of the face value");
      // No unverifiable labels on plan cards.
      await expect(page.locator("#pricing .lp-plan", { hasText: /most popular|recommended|best value/i })).toHaveCount(0);
      await page.goto("/#pricing");
      await expect(page).toHaveURL(/\/pricing$/);
    });
  });
}
