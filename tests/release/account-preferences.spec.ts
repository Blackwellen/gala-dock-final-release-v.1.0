import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { admin, createUser, cleanup, login, signedIn, BASE } from '../phase1/helpers';

test.describe('Account preferences on the production PWA', () => {
  let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
  test.beforeAll(async () => {
    owner = await createUser('account-preferences', 'Account Preferences');
    other = await createUser('account-other', 'Other Account');
    for (const user of [owner, other]) {
      const result = await admin.from('profiles').update({ onboarding_complete: true, home_area: 'Original area', interests: [], currency: 'GBP' }).eq('id', user.id);
      if (result.error) throw result.error;
    }
  });
  test.afterAll(cleanup);
  test('preferences persist through the real action; dialog fits phone and tablet orientations', async ({ page }) => {
    await login(page, owner.email, '/account');
    for (const size of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 820, height: 360 }, { width: 1180, height: 820 }]) {
      await page.setViewportSize(size); await page.goto(`${BASE}/account`);
      await expect(page.getByRole('heading', { name: 'My Account', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Edit preferences', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit event preferences', exact: true });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (size.width === 390) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'Edit preferences', exact: true })).toBeFocused();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Edit preferences', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit event preferences', exact: true });
    await dialog.getByLabel('Preferred area', { exact: true }).fill('Bristol');
    await dialog.getByLabel('Currency', { exact: true }).selectOption('EUR');
    await dialog.getByLabel('Music & Concerts', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(dialog).toBeHidden(); await page.reload();
    await expect(page.locator('.ac-preferences')).toContainText('Bristol');
    await expect(page.locator('.ac-preferences')).toContainText('EUR');
    await expect(page.locator('.ac-preferences')).toContainText('Music & Concerts');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: 'artifacts/pwa/finish-account-mobile.png', fullPage: true });
    const client = await signedIn(owner.email);
    const own = await client.from('profiles').select('home_area,currency,interests').eq('id', owner.id).single();
    expect(own.error).toBeNull(); expect(own.data).toEqual({ home_area: 'Bristol', currency: 'EUR', interests: ['Music & Concerts'] });
    const attempt = await client.from('profiles').update({ home_area: 'Unauthorized replacement' }).eq('id', other.id).select('id');
    expect(attempt.data ?? []).toEqual([]);
    const unchanged = await admin.from('profiles').select('home_area').eq('id', other.id).single();
    expect(unchanged.data?.home_area).toBe('Original area');
  });
});
