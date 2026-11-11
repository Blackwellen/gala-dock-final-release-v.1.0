import fs from "node:fs";
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3107";
const PAGES = {
  provider: ["/provider", "/provider/listings", "/provider/team", "/provider/opportunities", "/provider/money", "/provider/bookings", "/provider/calendar"],
  organizer: ["/organizer", "/organizer/events", "/organizer/team", "/organizer/money", "/organizer/sales", "/organizer/marketplace", "/organizer/tickets"],
  admin: ["/admin", "/admin/events", "/admin/tickets", "/admin/marketplace", "/admin/commerce", "/admin/workspaces", "/admin/analytics"],
  customer: ["/account", "/account/events", "/home"],
};
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const issues = [];
for (const [persona, routes] of Object.entries(PAGES)) {
  const state = `artifacts/auth/${persona}.json`;
  if (!fs.existsSync(state)) { console.log("no auth state for", persona); continue; }
  const ctx = await b.newContext({ storageState: state, viewport: { width: 1440, height: 1000 } });
  for (const route of routes) {
    const p = await ctx.newPage();
    try { await p.goto(BASE + route, { waitUntil: "load", timeout: 60000 }); await p.waitForTimeout(2500); } catch { console.log("load fail", route); await p.close(); continue; }
    if (!p.url().includes(route.split("?")[0])) { console.log("redirected", route, "->", new URL(p.url()).pathname); await p.close(); continue; }
    const found = await p.evaluate(() => {
      const out = [];
      for (const svg of document.querySelectorAll("svg")) {
        const circles = [...svg.querySelectorAll("circle")].filter(c => Number(c.getAttribute("r")) >= 8 && (c.getAttribute("fill") === "none" || getComputedStyle(c).fill === "none"));
        if (circles.length < 1) continue;
        const sb = svg.getBoundingClientRect(); if (sb.width < 30 || sb.height < 30 || Math.abs(sb.width - sb.height) > 4) continue;
        const cx = sb.left + sb.width / 2, cy = sb.top + sb.height / 2;
        // Text inside the circle: <text> in the svg, or HTML text whose box overlaps the ring centre within its container.
        let host = svg.parentElement; let texts = [];
        for (let i = 0; i < 3 && host; i++, host = host.parentElement) {
          const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
          for (let n; (n = walker.nextNode());) {
            if (!n.textContent.trim()) continue;
            const r = document.createRange(); r.selectNodeContents(n); const tb = r.getBoundingClientRect();
            if (!tb.width || getComputedStyle(n.parentElement).visibility === "hidden" || getComputedStyle(n.parentElement).display === "none") continue;
            if (tb.left >= sb.left - 2 && tb.right <= sb.right + 2 && tb.top >= sb.top - 2 && tb.bottom <= sb.bottom + 2) texts.push({ t: n.textContent.trim().slice(0, 20), tb });
          }
          if (texts.length) break;
        }
        if (!texts.length) continue;
        const top = Math.min(...texts.map(x => x.tb.top)), bottom = Math.max(...texts.map(x => x.tb.bottom)), left = Math.min(...texts.map(x => x.tb.left)), right = Math.max(...texts.map(x => x.tb.right));
        const dx = (left + right) / 2 - cx, dy = (top + bottom) / 2 - cy;
        out.push({ text: texts.map(x => x.t).join(" "), size: Math.round(sb.width), dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, cls: (svg.parentElement.className?.baseVal ?? svg.parentElement.className ?? "").toString().slice(0, 40) });
      }
      return out;
    });
    for (const f of found) if (Math.abs(f.dx) > 2.5 || Math.abs(f.dy) > 2.5) issues.push({ route, ...f });
    console.log(route, `${found.length} rings`, found.filter(f => Math.abs(f.dx) > 2.5 || Math.abs(f.dy) > 2.5).length, "off-centre");
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(issues, null, 1));
