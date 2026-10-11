import { chromium } from "@playwright/test";
const [,, who, url, ...sels] = process.argv;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await b.newContext({ storageState: `artifacts/auth/${who}.json`, viewport: { width: 1536, height: 1024 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3107" + url, { waitUntil: "networkidle" });
for (const s of sels) console.log(s, JSON.stringify(await p.evaluate(s => [...document.querySelectorAll(s)].slice(0, 16).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }), s)));
await b.close();
