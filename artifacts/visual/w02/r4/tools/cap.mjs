// Lane B pass 3 capture + census: routes x viewports -> screenshot, DOM card boxes (for region diff), overflow, unnamed controls,
// dead anchors, console errors, internal links, head metadata. Usage:
//   node --env-file=.env.local cap.mjs <customer|public> <outDir> <routes.json> <WxH,...> [--full] [--jpeg] [--links] [--boxes] [--dpr=N]
// routes.json: [{name, path, click?}]. Customer signs in with the demo customer (password from env) when the stored state is stale.
import { chromium } from "file:///C:/Users/PC/Documents/Blackwellen/Built/Gala%20Dock/node_modules/@playwright/test/index.mjs";
import fs from "node:fs/promises";
const pos = process.argv.slice(2).filter(a => !a.startsWith("--")); const flag = f => process.argv.includes("--" + f);
const opt = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split("=")[1];
const [role, outDir, routesFile, sizesArg] = pos;
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const routes = JSON.parse(await fs.readFile(routesFile, "utf8"));
const sizes = sizesArg.split(",").map(s => s.split("x").map(Number));
await fs.mkdir(outDir, { recursive: true });
const STATE = process.env.STATE ?? "C:/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen-Built-Gala-Dock/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/b4-w02/.state-customer.json";
const PUBLIC = role === "public";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const results = []; const links = new Set();
async function signIn(page, ctx) {
  await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 60000 });
  await page.fill('input[name="email"]', "alex.thompson@example.com");
  await page.fill('input[name="password"]', process.env.DEMO_CUSTOMER_PASSWORD);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 90000 }), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: STATE });
}
try {
  for (const [w, h] of sizes) {
    const hasState = !PUBLIC && await fs.stat(STATE).then(() => true, () => false);
    const mobile = w < 500 || (h < 500 && w < 1000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(opt("dpr") ?? 1), reducedMotion: "reduce", hasTouch: w < 1100, isMobile: mobile, ...(hasState ? { storageState: STATE } : {}) });
    const page = await ctx.newPage();
    for (const r of routes) {
      const errors = [];
      page.removeAllListeners("pageerror"); page.removeAllListeners("console");
      page.on("pageerror", e => errors.push("pageerror: " + e.message.slice(0, 200)));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      let status = 0;
      const go = async () => { const resp = await page.goto(BASE + r.path, { waitUntil: "load", timeout: 180000 }); status = resp?.status() ?? 0; await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); };
      try { await go(); if (!PUBLIC && new URL(page.url()).pathname.startsWith("/login") && !r.path.startsWith("/login")) { await signIn(page, ctx); errors.length = 0; await go(); } } catch (e) { errors.push("goto: " + e.message.slice(0, 120)); }
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}" }).catch(() => {});
      if (r.click) { await page.click(r.click, { timeout: 8000 }).catch(e => errors.push("click: " + e.message.slice(0, 80))); await page.waitForTimeout(600); }
      await page.waitForTimeout(350);
      const name = `${r.name}-${w}x${h}`;
      await page.screenshot({ path: `${outDir}/${name}.${flag("jpeg") ? "jpg" : "png"}`, fullPage: flag("full"), ...(flag("jpeg") ? { type: "jpeg", quality: 60 } : {}) }).catch(() => {});
      const c = await page.evaluate(wantBoxes => {
        const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0; };
        const t = s => (s || "").replace(/\s+/g, " ").trim();
        const named = el => {
          if (t(el.getAttribute("aria-label"))) return true;
          const lb = el.getAttribute("aria-labelledby"); if (lb && lb.split(" ").some(id => t(document.getElementById(id)?.textContent))) return true;
          if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
            if (el.type === "hidden") return true;
            if (el.id && t(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent)) return true;
            if (t(el.closest("label")?.textContent)) return true;
            if (t(el.getAttribute("title")) || t(el.getAttribute("placeholder"))) return true;
            if (["submit", "button"].includes(el.type) && t(el.value)) return true;
            return false;
          }
          if (t(el.innerText) || t(el.getAttribute("title"))) return true;
          if ([...el.querySelectorAll("img[alt],svg[aria-label],[role=img][aria-label]")].some(i => t(i.getAttribute("alt") || i.getAttribute("aria-label")))) return true;
          return false;
        };
        const ctrls = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="tab"],[role="menuitem"],[role="radio"],[role="checkbox"],[role="switch"]')].filter(vis);
        const unnamed = ctrls.filter(el => !named(el)).map(el => el.outerHTML.slice(0, 160));
        const hrefs = [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => h && h.startsWith("/") && !h.startsWith("//"));
        const dead = [...document.querySelectorAll('a[href="#"],a[href=""]')].filter(vis).length;
        const over = document.documentElement.scrollWidth > innerWidth + 1;
        const offenders = over ? [...document.querySelectorAll("body *")].filter(el => { const b = el.getBoundingClientRect(); if (b.right <= innerWidth + 1 || b.width === 0) return false; let p = el.parentElement; while (p) { const o = getComputedStyle(p).overflowX; if (["auto", "scroll", "hidden", "clip"].includes(o)) return false; p = p.parentElement; } return true; }).slice(0, 5).map(el => el.tagName + "." + String(el.className).slice(0, 60) + "|r=" + Math.round(el.getBoundingClientRect().right)) : [];
        const boxes = [];
        if (wantBoxes) {
          const opaque = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return false; const p = m[1].split(",").map(Number); return p.length < 4 || p[3] > 0.5; };
          for (const el of document.querySelectorAll("body *")) {
            const b = el.getBoundingClientRect(); if (b.width < 100 || b.height < 36) continue;
            const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") continue;
            const bw = ["Top", "Right", "Bottom", "Left"].filter(k => parseFloat(s[`border${k}Width`]) >= 1 && opaque(s[`border${k}Color`])).length;
            const card = /^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName) || bw >= 3 || (s.boxShadow !== "none" && opaque(s.backgroundColor)) || (parseFloat(s.borderTopLeftRadius) >= 6 && opaque(s.backgroundColor) && s.backgroundColor !== getComputedStyle(el.parentElement).backgroundColor);
            if (card) boxes.push({ x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50) });
          }
        }
        const meta = { title: document.title, canonical: document.querySelector("link[rel=canonical]")?.href ?? null, robots: document.querySelector("meta[name=robots]")?.content ?? null,
          ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null, ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null, h1: [...document.querySelectorAll("h1")].map(h => t(h.textContent)).slice(0, 3) };
        return { controls: ctrls.length, unnamed, hrefs, dead, over, sw: document.documentElement.scrollWidth, offenders, url: location.pathname + location.search, boxes, meta, docH: document.documentElement.scrollHeight };
      }, flag("boxes")).catch(e => ({ controls: 0, unnamed: [], hrefs: [], dead: 0, over: false, offenders: [], url: "", boxes: [], err: String(e).slice(0, 100) }));
      c.hrefs.forEach(x => links.add(x.split("#")[0]));
      if (flag("boxes")) await fs.writeFile(`${outDir}/${name}.boxes.json`, JSON.stringify(c.boxes));
      results.push({ route: r.path, name: r.name, w, h, status, finalPath: c.url, controls: c.controls, unnamed: c.unnamed, dead: c.dead, overflowX: c.over, scrollWidth: c.sw, offenders: c.offenders, errors, meta: c.meta, docH: c.docH });
      console.log(`${w}x${h} ${r.name} st=${status} -> ${c.url} ctl=${c.controls} unnamed=${c.unnamed.length} dead=${c.dead} over=${c.over} err=${errors.length}${errors.length ? " " + errors[0].slice(0, 90) : ""}`);
    }
    await ctx.close();
  }
  const linkRes = [];
  if (flag("links")) {
    const ctx = await browser.newContext(PUBLIC ? {} : { storageState: STATE });
    for (const href of [...links].filter(Boolean)) {
      // Never fetch state-changing GETs: virtual join issues a token and records a check-in; replay records a view.
      if (/^\/(auth\/signout|api\/|logout|tickets\/[^/]+\/join|virtual\/)/.test(href)) { linkRes.push({ href, status: "skipped" }); continue; }
      try { const r = await ctx.request.get(BASE + href, { timeout: 120000, maxRedirects: 5 }); linkRes.push({ href, status: r.status() }); } catch (e) { linkRes.push({ href, status: "error " + e.message.slice(0, 60) }); }
    }
    await ctx.close();
    const bad = linkRes.filter(l => typeof l.status !== "number" || l.status >= 400);
    console.log("LINKS", linkRes.length, "BAD", JSON.stringify(bad));
  }
  await fs.writeFile(`${outDir}/census.json`, JSON.stringify({ results, links: linkRes }, null, 1));
} finally { await browser.close(); }
