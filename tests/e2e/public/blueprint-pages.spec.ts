import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";

// Public website blueprint (Designs/Public Pages/public/Gala_Dock_Public_Pages_Blueprint.docx, §1 and §10). The seven pages at
// phone (390), tablet portrait (768), laptop (1280) and design width (1536): renders, exactly one h1, the global header and
// footer, no horizontal overflow, axe 0 (WCAG 2.2 AA, reduced motion so nothing is mid-transition), every header link resolves,
// and under reduced motion every animated element is already in its final state. Plus live prices on /pricing, phone landscape
// and tablet landscape sanity. Read-only.
const PAGES = ["/", "/organisers", "/providers", "/build-an-event", "/developers", "/about", "/pricing"];
const WIDTHS: [number, number][] = [[390, 844], [768, 1024], [1280, 800], [1536, 864]];
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

async function open(page: Page, route: string) {
  const res = await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load").catch(() => null);
  return res;
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const [width, height] of WIDTHS) {
  test.describe(`blueprint pages @${width}`, () => {
    test.use({ viewport: { width, height } });
    for (const route of PAGES) {
      test(route, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const res = await open(page, route);
        expect(res?.status(), `${route} status`).toBe(200);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("header.pub-top")).toBeVisible();
        await expect(page.locator("footer.dir-footer")).toBeVisible();
        expect(await noOverflow(page), `${route} @${width} horizontal overflow`).toBe(true);
        // Reduced motion: no entrance state is ever applied (html.gp-motion absent) and every revealed element is opaque.
        expect(await page.evaluate(() => document.documentElement.classList.contains("gp-motion"))).toBe(false);
        const hidden = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-rv]")].filter(e => getComputedStyle(e).opacity !== "1").length);
        expect(hidden, `${route} elements left hidden under reduced motion`).toBe(0);
        // Important copy is server-rendered: the h1 is in the initial HTML.
        const html = await (await page.request.get(route)).text();
        expect(html).toMatch(/<h1[^>]*>/);
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${route} @${width} axe`).toEqual([]);
      });
    }
  });
}

test.describe("navigation and data", () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test("header and footer links resolve (no 404 / 5xx)", async ({ page }) => {
    await open(page, "/");
    const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll<HTMLAnchorElement>("header.pub-top a[href], footer.dir-footer a[href]")].map(a => a.getAttribute("href")!))]);
    expect(hrefs).toEqual(expect.arrayContaining(["/organisers", "/providers", "/build-an-event", "/developers", "/about", "/pricing", "/login", "/register", "/accessibility"]));
    for (const h of hrefs.filter(h => h.startsWith("/"))) {
      const r = await page.request.get(h.split("#")[0]!, { maxRedirects: 5 });
      expect(r.status(), h).toBeLessThan(400);
    }
  });

  test("header marks the current page; mobile menu opens, traps focus and closes on Escape", async ({ page }) => {
    await open(page, "/developers");
    await expect(page.locator("header.pub-top nav a[aria-current=page]")).toHaveText("Developers");
    await page.setViewportSize({ width: 390, height: 844 });
    const btn = page.getByRole("button", { name: "Open menu" });
    await btn.click();
    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(btn).toBeFocused();
  });

  test("/pricing shows live organiser Pro and provider fee from the database", async ({ page }) => {
    const { data } = await anon.from("plan_prices").select("kind,plan,billing_interval,price_minor").eq("active", true).eq("kind", "organizer").eq("plan", "pro").eq("billing_interval", "month");
    const { data: ent } = await anon.from("plan_entitlements").select("value").eq("kind", "provider").eq("plan", "starter").eq("capability", "commission.rate_bps");
    await open(page, "/pricing");
    if (data?.[0]) await expect(page.locator("#pricing .lp-plan", { has: page.getByRole("heading", { name: "Pro", exact: true }) })).toContainText(gbp(data[0].price_minor));
    if (ent?.[0]) await expect(page.locator(".gpr-econ")).toContainText(`${(Number(ent[0].value) / 100).toLocaleString("en-GB")}% platform fee`);
  });

  test("no escrow or held-funds claims and no unverifiable labels on any page", async ({ page }) => {
    for (const route of PAGES) {
      await open(page, route);
      const text = (await page.locator("main").innerText()).toLowerCase();
      expect(text, route).not.toMatch(/escrow|funds held by gala dock|most popular|best value|trusted by \d/);
    }
  });

  test("old anchors and renamed routes redirect", async ({ page }) => {
    for (const [from, to] of [["/#pricing", /\/pricing$/], ["/#professionals", /\/organisers$/], ["/#marketplace", /\/providers$/], ["/about-us", /\/about$/], ["/customers", /\/build-an-event$/], ["/organizers", /\/organisers$/]] as const) {
      await page.goto(from);
      await expect(page, from).toHaveURL(to);
    }
    expect((await page.request.get("/help/developers-api")).status()).toBe(200);
  });

  test("sitemap lists all seven routes; robots keeps /providers crawlable", async ({ page }) => {
    const sm = await (await page.request.get("/sitemap.xml")).text();
    for (const r of PAGES) expect(sm).toContain(`${r === "/" ? "" : r}</loc>`);
    const robots = await (await page.request.get("/robots.txt")).text();
    expect(robots).not.toMatch(/^Disallow: \/provider$/m);
  });
});

for (const [width, height, label] of [[844, 390, "phone landscape"], [1180, 820, "tablet landscape"]] as const) {
  test(`${label}: every page renders without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const route of PAGES) {
      await open(page, route);
      expect(await noOverflow(page), `${route} ${label}`).toBe(true);
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });
}
