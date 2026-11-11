import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: false, args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"] });
const p = await b.newPage();
await p.goto("https://www.galadock.com/login", { waitUntil: "load" });
for (let i = 0; i < 12; i++) {
  await p.waitForTimeout(2500);
  const n = await p.evaluate(() => (window.turnstile ? (window.turnstile.getResponse() ?? "").length : -1));
  console.log(`${(i + 1) * 2.5}s token length`, n);
  if (n > 0) break;
}
await b.close();
