// Usage: node scripts/inspect-element.mjs <url> <width> <height> "<js expression returning JSON>"
import { chromium } from "@playwright/test";
const [url, w, h, expr] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
await page.goto(`http://localhost:3107${url}`, { waitUntil: "networkidle", timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(expr), null, 1));
await browser.close();
