// Print bounding boxes (reference density, 1536x1024) for CSS selectors on a page.
// Usage: node --env-file=.env.local scripts/design/measure.mjs <customer|organizer> <path> <selector> [selector...]
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const [role, path, ...sels] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const state = `artifacts/visual/state-${role}.json`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const hasState = await fs.stat(state).then(() => true, () => false);
const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1, ...(hasState ? { storageState: state } : {}) });
await ctx.addInitScript(() => { try { localStorage.setItem("gd-density", "reference"); } catch {} document.documentElement.setAttribute("data-density", "reference"); });
const page = await ctx.newPage();
await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
const out = await page.evaluate(sels => sels.map(s => [s, [...document.querySelectorAll(s)].slice(0, 8).map(el => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; }).join(" | ")]), sels);
for (const [s, v] of out) console.log(`${s}: ${v}`);
await browser.close();
