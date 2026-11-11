import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { emailHtml, escapeHtml } from "../../src/lib/email/layout.ts";
const dir = "artifacts/email-preview";
const body = "Your tickets for Summer Sessions 2026 are confirmed.\n\nSaturday 15 August 2026 · 7:00pm\nThe Grand Hall, London\n\n2 × General Admission";
fs.writeFileSync(`${dir}/tx-tickets.html`, emailHtml({ preheader: "Your tickets are confirmed", eyebrow: "Tickets", heading: "You’re going to Summer Sessions 2026",
  bodyHtml: `<p style="margin:0">${escapeHtml(body).replace(/\n{2,}/g, '</p><p style="margin:14px 0 0">').replace(/\n/g, "<br>")}</p>`, cta: { label: "View tickets", url: "https://www.galadock.com/account/tickets" },
  footerNote: "You’re receiving this because it concerns your account’s security or payments." }));
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const [f, w] of [["tx-tickets", 760], ["auth-recovery", 760], ["auth-reauthentication", 760], ["auth-confirmation", 390]]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(pathToFileURL(`${dir}/${f}.html`).href); await p.waitForTimeout(800);
  await p.screenshot({ path: `${dir}/${f}-${w}.png`, fullPage: true }); await p.close();
}
await b.close(); console.log("ok");
