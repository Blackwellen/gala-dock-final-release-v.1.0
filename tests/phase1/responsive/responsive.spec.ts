import { test, expect } from "@playwright/test";
import { BASE } from "../helpers";
import { screens } from "../accessibility/a11y.spec";

// Viewport matrix from the release spec. Captures screenshots for review and asserts no clipping.
const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080 }, { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 800 }, { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 }, { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 }, { name: "mobile-375", width: 375, height: 667 },
  { name: "mobile-320", width: 320, height: 640 }, { name: "mobile-landscape", width: 844, height: 390 },
];

for (const vp of viewports) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, launchOptions: { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } });
    for (const path of screens) {
      test(path, async ({ page }) => {
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        const report = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const overflow = document.documentElement.scrollWidth - width;
          // Visible controls pushed off-screen horizontally (clipped buttons/inputs).
          const clipped = [...document.querySelectorAll("button, a.button, input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")]
            .filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && s.visibility !== "hidden" && (r.right > width + 1 || r.left < -1); })
            .map(el => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40));
          // Primary actions on touch widths should be at least 40px tall.
          const small = width < 700 ? [...document.querySelectorAll(".setup-actions .button, .auth-card form > .button")].filter(el => el.getBoundingClientRect().height < 40).length : 0;
          const tinyText = [...document.querySelectorAll("p, label, small, span, b")].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(el).fontSize) < 10 && el.getBoundingClientRect().width > 0).length;
          return { overflow, clipped, small, tinyText };
        });
        await page.screenshot({ path: `artifacts/visual-responsive/${vp.name}/${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
        expect(report.overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0);
        expect(report.clipped, "clipped controls").toEqual([]);
        expect(report.small, "primary actions under 40px on touch").toBe(0);
        expect.soft(report.tinyText, "text under 10px").toBe(0);
      });
    }
  });
}
