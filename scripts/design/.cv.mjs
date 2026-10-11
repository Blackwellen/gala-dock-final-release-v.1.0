import { chromium } from "playwright"; import fs from "node:fs";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, storageState: "artifacts/visual/state-organizer.json" });
const page = await ctx.newPage(); await page.goto("http://localhost:3107" + process.argv[2], { waitUntil: "load" }); await page.waitForTimeout(5000);
const sel = process.argv[3]; if (sel) { await page.click(sel); await page.waitForTimeout(2500); }
const d = await page.evaluate(() => document.querySelector(".pb-sel canvas").toDataURL("image/png"));
fs.writeFileSync(process.argv[4] ?? "artifacts/visual/p2/poster.png", Buffer.from(d.split(",")[1], "base64")); await browser.close();
