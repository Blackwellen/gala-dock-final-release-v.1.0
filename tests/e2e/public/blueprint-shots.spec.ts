import { test } from "@playwright/test";

// Visual evidence for the public website (not an assertion suite): full-page screenshots of the seven blueprint pages at the
// review widths, in their final (reduced-motion) state, to artifacts/public-site/<page>-<width>.png. Run with SHOTS=1.
test.skip(process.env.SHOTS !== "1", "set SHOTS=1 to capture screenshots");
const PAGES: [string, string][] = [["landing", "/"], ["organisers", "/organisers"], ["providers", "/providers"], ["build-an-event", "/build-an-event"], ["developers", "/developers"], ["about", "/about"], ["pricing", "/pricing"]];
const WIDTHS = (process.env.SHOT_WIDTHS ?? "390,768,1280,1536").split(",").map(Number);

for (const width of WIDTHS) {
  for (const [name, route] of PAGES.filter(([n]) => !process.env.SHOT_PAGES || process.env.SHOT_PAGES.split(",").includes(n))) {
    test(`${name} @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route, { waitUntil: "load" });
      // Lazy images load only near the viewport: walk the page once, then return to the top.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForLoadState("networkidle").catch(() => null);
      await page.screenshot({ path: `artifacts/public-site/${name}-${width}.png`, fullPage: true });
    });
  }
}
