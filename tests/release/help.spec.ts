import { test, expect } from "@playwright/test";
import { BASE } from "../phase1/helpers";

// Release spec §84–85: help links resolve; articles show real annotated screenshots; search works.
test.describe("help centre", () => {
  test("in-app help links resolve to articles", async ({ request }) => {
    for (const topic of ["tickets", "billing", "booking-problem", "review-policy", "ticketing-terms"]) {
      const r = await request.get(`${BASE}/help?topic=${topic}`);
      expect(r.status(), topic).toBe(200);
      expect(r.url()).toMatch(/\/help\/[a-z-]+$/);
    }
  });

  test("article renders an annotated screenshot and the index searches", async ({ page }) => {
    await page.goto(`${BASE}/help/getting-started-organizers`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Getting started as an organizer");
    await expect(page.locator(".hc-shot img")).toBeVisible();
    expect(await page.locator(".hc-mark").count()).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: "test-results/help-article.png", fullPage: false });
    await page.goto(`${BASE}/help?q=recovery`);
    await expect(page.getByRole("link", { name: /two-step verification/i })).toBeVisible();
  });
});
