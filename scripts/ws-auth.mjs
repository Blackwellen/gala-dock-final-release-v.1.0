// Signs in through the real UI (password → MFA where required) and saves Playwright storage states.
// Usage: node --env-file=.env --env-file=.env.local scripts/ws-auth.mjs [provider|admin|support|organizer]...
// Output: artifacts/auth/<who>.json (git-ignored artifacts). BASE_URL defaults to http://localhost:3107.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { totp } from "./totp.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const WHO = {
  organizer: { email: "alex.events@example.com", pass: process.env.DEMO_ORGANIZER_PASSWORD, land: "/organizer" },
  provider: { email: "provider.demo@example.com", pass: process.env.DEMO_PROVIDER_PASSWORD, land: "/provider", workspace: "Riverside Arena" },
  admin: { email: "admin.demo@example.com", pass: process.env.DEMO_ADMIN_PASSWORD, secret: process.env.DEMO_ADMIN_TOTP_SECRET, land: "/admin", login: "/admin/login" },
  support: { email: "support.demo@example.com", pass: process.env.DEMO_SUPPORT_ADMIN_PASSWORD, secret: process.env.DEMO_SUPPORT_ADMIN_TOTP_SECRET, land: "/admin", login: "/admin/login" },
};
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["provider", "admin"];
await fs.mkdir("artifacts/auth", { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  for (const who of targets) {
    const u = WHO[who];
    if (!u?.pass) { console.error(`${who}: missing password env`); process.exitCode = 1; continue; }
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}${u.login ?? `/login?next=${encodeURIComponent(u.land)}`}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('input[name="email"]', { timeout: 120000 });
    await page.fill('input[name="email"]', u.email);
    await page.fill('input[name="password"]', u.pass);
    await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 120000 });
    await page.click('button[type="submit"]');
    if (u.secret) {
      await page.waitForURL(/\/mfa/, { timeout: 60000 });
      await page.waitForSelector('input[aria-label="Digit 1"]', { timeout: 60000 });
      // Avoid a code that rolls over mid-entry.
      if (Date.now() % 30000 > 25000) await page.waitForTimeout(30000 - (Date.now() % 30000) + 500);
      await page.locator('input[aria-label="Digit 1"]').focus();
      await page.keyboard.type(totp(u.secret), { delay: 40 });
      const submit = page.locator('button[type="submit"]').first();
      if (await submit.isEnabled().catch(() => false)) await submit.click().catch(() => {});
    }
    await page.waitForURL(url => new URL(url).pathname.startsWith(u.land), { timeout: 90000 });
    if (u.workspace) {
      // Select the design's workspace through the real switcher (server-validated cookie).
      await page.locator('button[aria-label="Switch workspace"]').click();
      const option = page.getByRole("menuitemradio", { name: u.workspace });
      if (await option.getAttribute("aria-checked") !== "true") {
        await Promise.all([page.waitForURL(/\/provider/, { timeout: 90000 }), option.click()]);
        await page.waitForLoadState("load");
      }
      await page.locator(".ws-switcher b", { hasText: u.workspace }).waitFor({ timeout: 90000 });
    }
    await ctx.storageState({ path: `artifacts/auth/${who}.json` });
    console.log(`${who}: signed in → ${new URL(page.url()).pathname}`);
    await ctx.close();
  }
} finally { await browser.close(); }
