import { test, expect, type Page } from "@playwright/test";
import { login } from "../p2-helpers";

// Coordinator fix (owner): at 390×844 a non-top-level page shows exactly one way back — the PWA bar's Back or the page's own
// back link, never both and never neither. Wizard-footer previous-step buttons are not counted. Read-only navigation.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function backs(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_500); // the bar re-checks as the page streams in
  return page.evaluate(() => {
    const vis = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";
    const ICON = "a:has(> svg.lucide-arrow-left), a:has(> svg.lucide-chevron-left), button:has(> svg.lucide-arrow-left)";
    const bar = [...document.querySelectorAll(".pwa-back")].filter(vis).length;
    const own = [...document.querySelectorAll(`[class*="back"], ${ICON}`)].filter(el => vis(el) && !el.closest(".pwa-top, .pwa-back, .pwa-tabs, .pwa-sheet, footer, [class*='foot'], dialog, [role=dialog], [role=menu]")
      && ([...el.classList].some(c => c === "back-link" || c.endsWith("-back")) || el.matches(ICON)) && /back/i.test((el.textContent ?? "") + (el.getAttribute("aria-label") ?? ""))).length;
    return { bar, own: own > 0 ? 1 : 0 };
  });
}

const ROUTES: Record<"customer" | "organizer" | "provider", string[]> = {
  customer: ["/account/events/efd4d0af-9437-4b0b-99cf-af7816fa2a62", "/account/events/efd4d0af-9437-4b0b-99cf-af7816fa2a62/build", "/account/events/efd4d0af-9437-4b0b-99cf-af7816fa2a62/money", "/account/tickets/d6122963-3531-4587-8969-3e902269640d"],
  organizer: ["/organizer/events/new?step=1", "/organizer/team", "/organizer/money"],
  provider: ["/provider/venues/new?step=1", "/provider/services/new?step=1", "/provider/venues/327451a6-0693-47f6-bbec-a480fe805db5/spaces/797bf40a-f809-499d-a3d7-ebd075ddf62f"],
};
for (const [who, routes] of Object.entries(ROUTES) as [keyof typeof ROUTES, string[]][]) {
  test(`${who}: exactly one back control at 390`, async ({ page }) => {
    await login(page, who, routes[0]!);
    for (const r of routes) {
      await page.goto(r);
      const b = await backs(page);
      expect(b.bar + b.own, `${r} bar=${b.bar} page=${b.own}`).toBe(1);
    }
  });
}
