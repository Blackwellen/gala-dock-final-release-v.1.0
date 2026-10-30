// Isolated Chrome profile. Installs and uninstalls only this profile's local app. No default-profile changes.
// Experimental methods documented at https://chromedevtools.github.io/devtools-protocol/tot/PWA/
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3120";
if (new URL(base).hostname !== "localhost") throw new Error("This installation check is restricted to the local release preview");
const profile = path.resolve("artifacts/auth", `pwa-install-${Date.now()}`);
const report = { observedUtc: new Date().toISOString(), scope: "Isolated local desktop Chrome install/launch with an explicit standalone user preference; no physical mobile certification", checks: [], status: "unverified" };
let installed = false, context, session, manifestId;
try {
  context = await chromium.launchPersistentContext(profile, { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, viewport: { width: 390, height: 844 } });
  const state = JSON.parse(await fs.readFile("artifacts/auth/pwa-resume-customer.json", "utf8")); await context.addCookies(state.cookies);
  const page = context.pages()[0]; await page.goto(`${base}/discover`, { waitUntil: "networkidle", timeout: 60_000 });
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
  if (!manifestUrl) throw new Error("manifest_missing");
  const manifest = await (await context.request.get(new URL(manifestUrl, base).href)).json(); manifestId = new URL(manifest.id, base).href;
  session = await context.browser().newBrowserCDPSession();
  await session.send("PWA.install", { manifestId, installUrlOrBundleUrl: `${base}/discover` }); installed = true; report.checks.push({ name: "install_command", passed: true });
  await session.send("PWA.getOsAppState", { manifestId }); report.checks.push({ name: "os_app_query", passed: true });
  await session.send("PWA.changeAppUserSettings", { manifestId, displayMode: "standalone" });
  report.checks.push({ name: "isolated_standalone_preference", passed: true });
  const appPage = context.waitForEvent("page", { timeout: 20_000 }).catch(() => null);
  const launched = await session.send("PWA.launch", { manifestId, url: `${base}/discover` });
  if (!launched.targetId) throw new Error("app_target_missing");
  const app = await appPage; if (!app) throw new Error("app_window_unavailable");
  await app.waitForURL(url => url.pathname === "/discover", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await app.getByRole("heading").first().waitFor({ timeout: 30_000 });
  const standalone = await app.evaluate(() => matchMedia("(display-mode: standalone)").matches);
  report.checks.push({ name: "standalone_display_mode", passed: standalone });
  const nav = app.getByRole("navigation", { name: "Primary", exact: true });
  report.checks.push({ name: "installed_five_option_navigation", passed: await nav.locator(":scope > a,:scope > button").count() === 5 });
  await app.screenshot({ path: "artifacts/pwa/certification-installed-desktop.png" });
  await app.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  const privateCached = await app.evaluate(async () => {
    const keys = await caches.keys(); const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat();
    return requests.some(request => /^\/(?:api|account|organizer|provider|admin)(?:\/|$)/.test(new URL(request.url).pathname));
  });
  report.checks.push({ name: "installed_app_private_cache_exclusion", passed: !privateCached });
  await context.setOffline(true);
  try {
    await app.goto(`${base}/account`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    report.checks.push({ name: "installed_offline_public_fallback", passed: await app.getByRole("heading", { name: "You’re offline", exact: true }).isVisible() });
  } finally { await context.setOffline(false); }
  report.status = report.checks.every(check => check.passed) ? "passed" : "failed";
} catch (error) { report.status = "blocked_or_failed"; report.reason = String(error.message).split("\n")[0]; }
finally {
  if (installed && session) {
    try { await session.send("PWA.uninstall", { manifestId }); report.checks.push({ name: "isolated_app_uninstalled", passed: true }); }
    catch { report.checks.push({ name: "isolated_app_uninstalled", passed: false }); report.status = "cleanup_failed"; }
  }
  if (context) await context.close();
  await fs.writeFile("artifacts/pwa/certification-installed-desktop.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
if (report.status !== "passed") process.exitCode = 1;
