import { test, expect } from "@playwright/test";
import { createUser, login, cleanup, admin } from "../../phase1/helpers";

// Coordinator fix (owner): plan wizard step 1 at phone widths — every event_type_aliases label is reachable (primary tile or
// "More types"), tiles are not squashed, nothing overflows, and the More list fits the viewport. Disposable customer.
test.afterAll(async () => { await cleanup(); });

for (const [w, h] of [[390, 844], [360, 740], [768, 1024]] as const) {
  test(`plan step 1 at ${w}×${h}: all event types reachable, no squash or overflow`, async ({ browser }) => {
    const u = await createUser(`pwph${w}`, "Plan Phone");
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: true });
    const page = await ctx.newPage();
    await login(page, u.email, "/plan?step=1"); await page.waitForURL(/\/plan/);
    await page.goto("/plan?step=1"); await page.locator(".pw-types").waitFor();
    const { data: aliases } = await (admin as unknown as { from: (t: string) => any }).from("event_type_aliases").select("label"); // eslint-disable-line @typescript-eslint/no-explicit-any
    const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, minW: Math.min(...[...document.querySelectorAll(".pw-types > *")].map(e => e.getBoundingClientRect().width)),
      tiles: [...document.querySelectorAll(".pw-types > button.pw-type:not(.more)")].map(e => (e.textContent ?? "").trim()) }));
    expect(m.over).toBe(false);
    expect(m.minW).toBeGreaterThanOrEqual(120);
    await page.locator(".pw-type.more").click();
    const menu = page.getByRole("menu"); await expect(menu).toBeVisible(); await page.waitForTimeout(500);
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(h + 1);
    const items = (await menu.getByRole("menuitem").allInnerTexts()).map(s => s.trim());
    for (const { label } of (aliases ?? []) as { label: string }[]) expect(items.includes(label) || m.tiles.some(t => t.includes(label)), label).toBe(true);
    await ctx.close();
  });
}
