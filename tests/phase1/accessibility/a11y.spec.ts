import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { BASE } from "../helpers";

// Preview routes render each screen with deterministic data (no session required).
export const screens = [
  "/preview/login", "/preview/register", "/preview/verify-email", "/preview/forgot-password", "/preview/reset-password",
  "/preview/mfa", "/preview/invite", "/preview/access", "/preview/onboarding", "/preview/onboarding/customer?step=1",
  ...[1, 2, 3, 4].map(s => `/preview/onboarding/organizer?step=${s}`), ...[1, 2, 3, 4].map(s => `/preview/onboarding/provider?step=${s}`),
];

for (const path of screens) {
  test(`WCAG 2.2 AA: ${path}`, async ({ page }) => {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter(v => v.impact === "serious" || v.impact === "critical");
    expect(serious.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    // One h1/h2 page heading, and every form control has an accessible name.
    expect(await page.locator("h1, h2").count()).toBeGreaterThan(0);
  });
}

test("keyboard: login form is operable without a mouse and shows focus", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").focus();
  await page.keyboard.type("someone@gala-dock.test");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
});

test("errors are announced and linked to their fields", async ({ page }) => {
  await page.goto(`${BASE}/register`);
  await page.getByRole("button", { name: "Create account" }).click();
  const name = page.getByLabel("Full name");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  const described = await name.getAttribute("aria-describedby");
  await expect(page.locator(`[id="${described}"]`)).toHaveText("Enter your full name.");
});
