// Raw unmasked reference comparison at the previously documented inferred viewport. Not an approved fidelity gate.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3120";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const ctx = await browser.newContext({ storageState: "artifacts/auth/pwa-resume-customer.json", viewport: { width: 357, height: 890 }, deviceScaleFactor: 2, reducedMotion: "reduce", timezoneId: "Europe/London" });
  const page = await ctx.newPage(); await page.goto(`${base}/account`, { waitUntil: "networkidle", timeout: 90_000 });
  if (new URL(page.url()).pathname !== "/account") throw new Error("Account fixture is not authenticated");
  await page.evaluate(() => document.fonts.ready);
  const current = PNG.sync.read(await page.screenshot({ animations: "disabled" })), reference = PNG.sync.read(await fs.readFile("artifacts/pwa/finish-account-reference.png"));
  if (current.width !== reference.width || current.height !== reference.height) throw new Error("Comparison dimensions differ");
  const diff = new PNG({ width: current.width, height: current.height });
  const mismatched = pixelmatch(reference.data, current.data, diff.data, current.width, current.height, { threshold: 0.12, includeAA: false });
  const overlay = new PNG({ width: current.width, height: current.height });
  for (let i = 0; i < overlay.data.length; i++) overlay.data[i] = i % 4 === 3 ? 255 : Math.round((reference.data[i] + current.data[i]) / 2);
  await fs.writeFile("artifacts/pwa/certification-account.png", PNG.sync.write(current));
  await fs.writeFile("artifacts/pwa/certification-account.diff.png", PNG.sync.write(diff));
  await fs.writeFile("artifacts/pwa/certification-account.overlay.png", PNG.sync.write(overlay));
  const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth - innerWidth, heading: document.querySelector(".ac>h1")?.getBoundingClientRect().toJSON(), profile: document.querySelector(".ac-profile-details")?.getBoundingClientRect().toJSON() }));
  const report = { observedUtc: new Date().toISOString(), route: "/account", reference: "artifacts/pwa/finish-account-reference.png", viewport: "357x890 DPR2, inferred and not approved", metric: "Raw unmasked pixelmatch, threshold 0.12, includeAA false", mismatchPercent: +(100 * mismatched / (current.width * current.height)).toFixed(2), geometry, certified: false };
  await fs.writeFile("artifacts/pwa/certification-account.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser.close(); }
