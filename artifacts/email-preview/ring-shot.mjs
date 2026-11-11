import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await b.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); await p.goto("http://localhost:3107/provider", { waitUntil: "load" }); await p.waitForTimeout(3000);
await p.locator(".ph-rel").screenshot({ path: "artifacts/email-preview/rings.png" }); await b.close();
