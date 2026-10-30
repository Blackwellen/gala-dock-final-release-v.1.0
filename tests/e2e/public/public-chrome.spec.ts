import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Owner request 2026-10-29: every public page carries the shared public header and footer (or the landing header/footer on `/`).
// Token portals, checkout and auth keep their minimal branded header by design but get the slim legal footer. `/maintenance`
// stays minimal. CHROME_OUT=<file> also writes the route × width table.

type Want = { header: "public" | "landing" | "brand" | "none"; footer: "public" | "landing" | "legal" | "none" };
const PUBLIC: Want = { header: "public", footer: "public" };
const TOKEN: Want = { header: "brand", footer: "legal" };
const ROUTES: [string, Want][] = [
  ["/", { header: "landing", footer: "landing" }],
  ["/events", PUBLIC], ["/events/in/london", PUBLIC], ["/events/calendar", PUBLIC], ["/events/category/music", PUBLIC], ["/events/neon-nights", PUBLIC],
  ["/events/neon-nights/register", PUBLIC], ["/venues/riverside-arena", PUBLIC], ["/services/elite-sounds-dj", PUBLIC],
  ["/organizers/75e6c471-8d5e-4b9f-b076-ff10cf209f01", PUBLIC], ["/p/alex-events-winter-nights", PUBLIC], ["/help", PUBLIC], ["/help/getting-started-organizers", PUBLIC],
  ["/terms", PUBLIC], ["/privacy", PUBLIC], ["/cookies", PUBLIC], ["/ticket-terms", PUBLIC], ["/data-retention", PUBLIC], ["/this-page-does-not-exist", PUBLIC],
  ["/rsvp/not-a-real-token", PUBLIC],
  ["/checkout/neon-nights", TOKEN],
  // Signed out, the confirmation and invite links show the sign-in card (auth cards keep their own branded card, no footer, by design).
  ["/checkout/neon-nights/confirmation", { header: "brand", footer: "none" }], ["/invite/not-a-real-token", { header: "brand", footer: "none" }],
  ["/pay/not-a-real-token", TOKEN], ["/contract/not-a-real-token", TOKEN], ["/proposal/not-a-real-token", TOKEN], ["/guest/not-a-real-token", TOKEN],
  ["/ref/NOTACODE", PUBLIC], ["/r/NOTACODE/consent", PUBLIC], ["/payments/NOTAREF", TOKEN],
  ["/maintenance", { header: "none", footer: "none" }],
];

const rows: string[] = [];
for (const width of [390, 1536]) {
  test.describe(`public chrome @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const [route, want] of ROUTES) {
      test(route, async ({ page }) => {
        const res = await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load").catch(() => null);
        const got = await page.evaluate(() => {
          const vis = (s: string) => [...document.querySelectorAll<HTMLElement>(s)].some(e => e.getBoundingClientRect().height > 0);
          return {
            header: vis("header.pub-top") ? "public" : vis(".lp-header") ? "landing" : vis(".co-top, .gd-brandbar, .auth-card .logo") ? "brand" : "none",
            footer: vis("footer.dir-footer, .dir-footer") ? "public" : vis(".lp-footer") ? "landing" : vis(".gd-legal-footer") ? "legal" : "none",
          };
        });
        rows.push(`${route}\t${width}\t${res?.status() ?? "-"}\t${got.header}\t${got.footer}`);
        expect(got.header, `${route} header`).toBe(want.header);
        expect(got.footer, `${route} footer`).toBe(want.footer);
      });
    }
  });
}
test.afterAll(() => { if (process.env.CHROME_OUT && rows.length) fs.appendFileSync(process.env.CHROME_OUT, rows.join("\n") + "\n"); });
