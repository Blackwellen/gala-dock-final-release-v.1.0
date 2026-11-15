// Public site "fully working" sweep: every public page is loaded signed-out at 1536 and 390; console errors, page errors, CSP
// violations (securitypolicyviolation) and failed same-origin requests are recorded; every internal link found on the pages is
// requested (redirects not followed) and anything ≥ 400 is reported; then the interactive widgets are exercised (lifecycle stages,
// three-ways dots, hero scroll cue, header mobile menu, pricing kind switch + FAQ, contact form presence + Turnstile).
// Run: node scripts/qa/public-crawl.mjs   → artifacts/release/public-crawl.json
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const PAGES = ["/", "/organisers", "/providers", "/build-an-event", "/developers", "/about", "/pricing", "/events", "/events/calendar",
  "/events/in/london", "/events/neon-nights", "/venues/riverside-arena", "/services/elite-sounds-dj", "/organizers/75e6c471-8d5e-4b9f-b076-ff10cf209f01",
  "/help", "/terms", "/privacy", "/cookies", "/ticket-terms", "/accessibility", "/legal"];
const out = { pages: {}, links: {}, badLinks: [], checks: [] };
const cookie = { name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" };
// Known dev-only noise (React DevTools banner, HMR socket) is not an error of the page.
const NOISE = /Download the React DevTools|\[HMR\]|\[Fast Refresh\]|webpack-hmr|_next\/webpack|turbopack/i;

const browser = await chromium.launch({ args: ["--disable-gpu"] });
const check = (name, ok, detail = "") => { out.checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
try {
  for (const width of [1536, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500, storageState: { cookies: [cookie], origins: [] } });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    const page = await ctx.newPage();
    let errs = [];
    page.on("console", m => { if (m.type() === "error" && !NOISE.test(m.text())) errs.push(m.text().slice(0, 300)); });
    page.on("pageerror", e => errs.push(`pageerror: ${String(e).slice(0, 300)}`));
    page.on("response", r => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !/favicon|\.map$/.test(u)) errs.push(`HTTP ${r.status()} ${u.slice(BASE.length)}`); });
    for (const path of PAGES) {
      errs = [];
      const res = await page.goto(BASE + path, { waitUntil: "load", timeout: 180000 });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); } });
      await page.waitForTimeout(800);
      const { csp, links } = await page.evaluate(() => ({ csp: window.__csp ?? [], links: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")) }));
      for (const h of links) if (h && h.startsWith("/") && !h.startsWith("//")) (out.links[h.split("#")[0] || "/"] ??= new Set()).add(path);
      out.pages[`${path}@${width}`] = { status: res?.status(), errors: [...new Set(errs)], csp };
      console.log(`${path}@${width} ${res?.status()} errors=${errs.length} csp=${csp.length}`);
    }

    if (width === 1536) {
      await page.goto(BASE + "/", { waitUntil: "load" });
      // Lifecycle: every stage button swaps the detail panel.
      const stages = page.locator(".gpl-life-ribbon button");
      const n = await stages.count(); let okStages = 0;
      for (let i = 0; i < n; i++) { await stages.nth(i).click(); await page.waitForTimeout(450); if ((await stages.nth(i).getAttribute("aria-current")) === "step" && ((await page.locator(".gpl-life-step").textContent()) ?? "").includes(`Stage ${i + 1}`)) okStages++; }
      check("landing lifecycle stages switch", n === 7 && okStages === 7, `${okStages}/${n}`);
      // Scroll cue goes to the three ways section.
      await page.evaluate(() => scrollTo(0, 0)); await page.locator(".gpl-scroll").click(); await page.waitForTimeout(900);
      const top = await page.evaluate(() => document.getElementById("three-ways").getBoundingClientRect().top);
      check("hero scroll cue reaches #three-ways", Math.abs(top) < 200, `top=${Math.round(top)}`);
      // Pricing: kind switch and FAQ.
      await page.goto(BASE + "/pricing", { waitUntil: "load" });
      const seg = page.locator(".gp-seg-btn");
      if (await seg.count() > 1) { await seg.nth(1).click(); await page.waitForTimeout(400); check("pricing kind switch", (await seg.nth(1).getAttribute("aria-pressed")) === "true" || (await seg.nth(1).getAttribute("aria-checked")) === "true" || (await seg.nth(1).getAttribute("class")).includes("is-on")); }
      // FAQ: the first answer starts open; the second opens (and the first closes) and then closes again.
      const faq = page.locator(".gpr-faq-item button").nth(1);
      await faq.click(); await page.waitForTimeout(600);
      const open = (await faq.getAttribute("aria-expanded")) === "true" && await page.locator(".gpr-faq-item").nth(1).locator(".gpr-faq-a").isVisible();
      await faq.click(); await page.waitForTimeout(600);
      const closed = (await faq.getAttribute("aria-expanded")) === "false" && await page.locator(".gpr-faq-a").count() === 0;
      check("pricing FAQ opens and closes", open && closed);
      // Contact form (help centre) renders with Turnstile.
      await page.goto(BASE + "/help#contact", { waitUntil: "load" }); await page.waitForTimeout(2500);
      const form = page.locator("[data-testid=public-contact-form]");
      const fields = await form.locator("input:not([name=website]),textarea,select").count();
      const turnstile = await page.evaluate(() => !!document.querySelector("script[src*='challenges.cloudflare.com'], iframe[src*='challenges.cloudflare.com']"));
      // The widget renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (production); local QA blanks it in .env.local.
      const siteKey = await page.evaluate(() => !!document.querySelector("[data-turnstile-host]")) || turnstile;
      check("help contact form present (signed out)", fields === 4, `fields=${fields} turnstile widget=${siteKey ? "rendered" : "off (no site key in this environment)"}`);
      // Submit path: server validation answers in the form (no row written); the honeypot path is accepted silently (no row).
      await form.locator("[name=name]").fill("QA"); await form.locator("[name=email]").fill("qa@example.com"); await form.locator("[name=message]").fill("short");
      await form.locator("[name=message]").evaluate(e => e.removeAttribute("minlength"));
      const [r1] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/contact")), form.locator("button[type=submit]").click()]);
      check("contact form posts and shows server validation", r1.status() === 400 && await form.locator(".hc-err").isVisible(), `status=${r1.status()}`);
      const hp = await page.evaluate(async () => (await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website: "bot" }) })).status);
      check("contact honeypot accepted silently", hp === 200, `status=${hp}`);
    } else {
      await page.goto(BASE + "/", { waitUntil: "load" });
      // Mobile menu opens, lists the pages, closes on Escape.
      await page.locator(".gp-menu-btn").click(); await page.waitForTimeout(500);
      const items = await page.locator(".gp-menu-list a").count();
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      const gone = !(await page.locator(".gp-sheet").isVisible().catch(() => false));
      check("mobile menu opens/closes", items >= 6 && gone, `items=${items}`);
      // Three ways dots scroll the rail.
      const dots = page.locator(".gpl-track-dots button");
      if (await dots.count() === 3) { await dots.nth(2).click(); await page.waitForTimeout(900); check("three-ways dots select a track", (await dots.nth(2).getAttribute("aria-pressed")) === "true"); }
    }
    await ctx.close();
  }
  // Every internal link.
  for (const h of Object.keys(out.links)) {
    if (/^\/api\/maps\/tile|^\/_next|\.(png|webp|jpg|svg|ico|webmanifest)$/.test(h)) { delete out.links[h]; continue; }
    let st = 0;
    try { st = (await fetch(BASE + h, { redirect: "manual", headers: { cookie: "gd_cc=1" } })).status; } catch { st = -1; }
    const from = [...out.links[h]];
    out.links[h] = { status: st, from };
    if (st >= 400 || st < 0) out.badLinks.push({ href: h, status: st, from });
  }
  console.log(`links checked: ${Object.keys(out.links).length}, bad: ${out.badLinks.length}`);
  for (const b of out.badLinks) console.log(`BAD ${b.status} ${b.href} (from ${b.from.slice(0, 3).join(", ")})`);
} finally { await browser.close(); }
fs.writeFileSync("artifacts/release/public-crawl.json", JSON.stringify(out, null, 1));
