import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

// Owner report 2026-10-29: the logo is tiny on some public pages (phones, help centre). One rule for every public page
// (src/styles/brand.css): header G mark 32–36px on phones (≤640, mark only), 40–44px with the full lockup above 640; auth cards
// follow their own rule (46, or 38 at ≤700); footer lockup mark ≥ 32px. Sizes are CSS px: the shells' design-width fit (--k-fit /
// --gd-fit-auth, owner decision) scales the whole page, so rendered px are divided by the element's currentCSSZoom.
// LOGO_MEASURE=1 also writes the full route × width table.

const ROUTES = ["/", "/events", "/events/in/london", "/events/calendar", "/events/neon-nights", "/venues/riverside-arena", "/services/elite-sounds-dj",
  "/organizers/75e6c471-8d5e-4b9f-b076-ff10cf209f01", "/help", "/help/getting-started-organizers", "/terms", "/privacy", "/cookies", "/ticket-terms", "/data-retention",
  "/rsvp/not-a-real-token", "/checkout/neon-nights", "/checkout/neon-nights/confirmation", "/login", "/register", "/forgot-password", "/access",
  "/p/alex-events-winter-nights", "/r/NOTACODE", "/partner", "/maintenance", "/this-page-does-not-exist", "/pay/not-a-real-token", "/guest/not-a-real-token", "/events/category/music", "/ref/NOTACODE", "/r/NOTACODE/consent", "/payments/NOTAREF"];
const ALL_WIDTHS = [360, 390, 430, 768, 1024, 1280, 1536, 1920];

type M = { role: "header" | "auth" | "footer" | "story"; mark: number; markW: number; word: number; wordW: number };
async function measure(page: Page): Promise<M[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".gd-lockup")].filter(l => l.offsetParent !== null || getComputedStyle(l).position === "fixed").map(l => {
    const r = (s: string) => { const el = l.querySelector<HTMLElement>(s); if (!el || getComputedStyle(el).display === "none") return { h: 0, w: 0 }; const b = el.getBoundingClientRect(), z = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1; return { h: Math.round(b.height / z * 10) / 10, w: Math.round(b.width / z * 10) / 10 }; };
    const role = l.closest("footer, .dir-footer, .lp-footer") ? "footer" : l.closest(".auth-card") ? "auth" : l.closest(".auth-story") ? "story" : "header";
    const m = r("img.gd-lockup-mark"), w = r("img.gd-lockup-word");
    return { role, mark: m.h, markW: m.w, word: w.h, wordW: w.w } as M;
  }));
}
const band = (role: M["role"], width: number): [number, number] => role === "auth" ? (width <= 700 ? [38, 38] : [46, 46]) : role === "footer" ? [32, 64] : role === "story" ? [40, 44] : width <= 640 ? [32, 36] : [40, 44];

const rows: string[] = [];
for (const width of process.env.LOGO_MEASURE === "1" ? ALL_WIDTHS : [390, 1536]) {
  test.describe(`logo size @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      test(`${route}`, async ({ page }) => {
        const res = await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load").catch(() => null);
        await page.evaluate(() => Promise.all([...document.querySelectorAll("img.gd-lockup-mark")].map(i => (i as HTMLImageElement).decode().catch(() => null))));
        const ms = await measure(page);
        rows.push(`${route}\t${width}\t${res?.status() ?? "-"}\t${ms.map(m => `${m.role}:${m.mark}${m.word ? `/${m.word}x${m.wordW}` : ""}`).join(" ") || "no logo"}`);
        for (const m of ms) {
          const [lo, hi] = band(m.role, width);
          expect(m.mark, `${route} @${width} ${m.role} mark height`).toBeGreaterThanOrEqual(lo - 0.5);
          expect(m.mark, `${route} @${width} ${m.role} mark height`).toBeLessThanOrEqual(hi + 0.5);
          if (m.role === "header" && width > 640) expect(m.word, `${route} @${width} wordmark shown`).toBeGreaterThan(0);
        }
      });
    }
  });
}
test.afterAll(() => { if (process.env.LOGO_MEASURE === "1" && rows.length) fs.appendFileSync(process.env.LOGO_OUT ?? "logo-sizes.tsv", rows.join("\n") + "\n"); });
