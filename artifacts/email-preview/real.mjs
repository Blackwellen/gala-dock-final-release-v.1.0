import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { emailHtml, escapeHtml } from "../../src/lib/email/layout.ts";
const dir = "artifacts/email-preview";
const body = "From 82.13.3.250 · Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko). If this wasn’t you, sign out other sessions and change your password.";
fs.writeFileSync(`${dir}/real-security.html`, emailHtml({ preheader: body.slice(0, 140), eyebrow: "Account security", heading: "New sign-in to your account",
  bodyHtml: `<p style="margin:0">${escapeHtml(body)}</p>`, cta: { label: "Review your account", url: "https://www.galadock.com/account?tab=security#sessions" },
  footerNote: "You’re receiving this because it concerns your account’s security or payments." }));
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: 360, height: 800 } });
await p.goto(pathToFileURL(`${dir}/real-security.html`).href); await p.waitForTimeout(800);
console.log("scrollWidth", await p.evaluate(() => document.documentElement.scrollWidth));
await p.screenshot({ path: `${dir}/real-security-360.png`, fullPage: true }); await b.close();
