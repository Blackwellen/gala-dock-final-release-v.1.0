import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, storageState: `artifacts/visual/state-${process.argv[3] ?? "organizer"}.json` });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") console.log("console:", m.text().slice(0, 5000)); });
page.on("pageerror", e => console.log("pageerror:", e.message.slice(0, 6000)));
await page.goto("http://localhost:3107" + process.argv[2], { waitUntil: "load" }); await page.waitForTimeout(3000); await browser.close();
