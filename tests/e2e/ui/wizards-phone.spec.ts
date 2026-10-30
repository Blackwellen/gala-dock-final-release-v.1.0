import { test, expect, type Page } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// W12 wizard sweep (lane C fixes, browser-verified by lane B): at 390 and 360 every wizard has no horizontal overflow, no
// option tile squeezed below 44px, a sticky footer that sits above the PWA tab bar, and the expected option counts.
// Read-only navigation on the demo accounts.
const E = "efd4d0af-9437-4b0b-99cf-af7816fa2a62";
type Check = { path: string | (() => Promise<string>); minTiles?: number; minSelect?: number };
const WIZ: Record<"customer" | "organizer" | "provider", Check[]> = {
  customer: [{ path: "/plan?step=1", minTiles: 9 }, { path: `/account/events/${E}/book?item=665763cf-9f61-4e74-955f-8e6b19e229a1` }, { path: `/account/events/${E}/tickets/setup?step=1` },
    { path: `/account/events/${E}/tickets/setup?step=2` }, { path: "/account/tickets/15651ef4-f685-4727-a242-966aea0a6f1f/resale" }],
  organizer: [{ path: "/organizer/events/new?event=e9041473-4e54-4ebf-ac5a-8f581f9e8728&step=1", minTiles: 13, minSelect: 18 },
    { path: async () => `/organizer/events/${(await admin().from("events").select("id").eq("slug", "neon-nights").single()).data!.id}/tickets/setup` },
    { path: async () => `/organizer/marketplace/requests/new?step=1&category=dj&event=${(await admin().from("events").select("id").eq("slug", "neon-nights").single()).data!.id}` },
    { path: "/organizer/proposals/new?id=1e349c09-07e5-4adc-9bf6-12e2f5edd5b9" }, { path: "/organizer/promotions/new" }, { path: "/organizer/money/invoices/new" }],
  provider: [{ path: "/provider/venues/new?venue=976f8ef9-1f17-4882-8f37-5bc634b20ee3&step=1" }, { path: "/provider/venues/new?venue=976f8ef9-1f17-4882-8f37-5bc634b20ee3&step=4" },
    { path: "/provider/services/new?service=b2e926ca-c555-478d-bcdc-7fb6351ecba9" }, { path: "/provider/packages/new?package=b1c9e54c-b689-4e1a-a73e-576072001aaa" }, { path: "/provider/bookings/new?step=1" }],
};

async function measure(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.addStyleTag({ content: ".ws-overlay-ctl,nextjs-portal{display:none!important}" }); // dev-only tools
  await page.evaluate(() => scrollTo(0, Math.max(0, document.documentElement.scrollHeight / 2 - innerHeight / 2)));
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const vis = (el: Element) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.display !== "none" && s.visibility !== "hidden"; };
    const over = document.documentElement.scrollWidth > innerWidth + 1;
    const squeezed = [...document.querySelectorAll("main [role=radio], main .pw-type, main [class*='-type']:is(button,label), main [class*='tile']:is(button,label)")].filter(vis).filter(e => e.getBoundingClientRect().width < 44).length;
    const tabs = [...document.querySelectorAll(".pwa-tabs")].find(vis);
    const foot = [...document.querySelectorAll(".bk-bar, .wz-foot, .pw-foot")].filter(vis).filter(f => { const b = f.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; });
    const under = tabs ? foot.filter(f => f.getBoundingClientRect().bottom > tabs.getBoundingClientRect().top + 1 && f.getBoundingClientRect().top < tabs.getBoundingClientRect().top).length : 0;
    const tiles = document.querySelectorAll(".pw-types > *, [role=radiogroup] [role=radio]").length;
    const maxSelect = Math.max(0, ...[...document.querySelectorAll("main select")].filter(vis).map(s => (s as HTMLSelectElement).options.length));
    return { over, squeezed, under, tiles, maxSelect };
  });
}

for (const width of [390, 360]) {
  for (const [who, checks] of Object.entries(WIZ) as [keyof typeof WIZ, Check[]][]) {
    test(`${who} wizards at ${width}: no overflow, no squeeze, footer above tabs, options present`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 740 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await login(page, who, "/");
      for (const c of checks) {
        const path = typeof c.path === "string" ? c.path : await c.path();
        await page.goto(path);
        const m = await measure(page);
        expect(m.over, `${path} overflow`).toBe(false);
        expect(m.squeezed, `${path} squeezed tiles`).toBe(0);
        expect(m.under, `${path} footer under tab bar`).toBe(0);
        if (c.minTiles) expect(m.tiles, `${path} option tiles`).toBeGreaterThanOrEqual(c.minTiles);
        if (c.minSelect) expect(m.maxSelect, `${path} select options`).toBeGreaterThanOrEqual(c.minSelect);
      }
      await ctx.close();
    });
  }
}
