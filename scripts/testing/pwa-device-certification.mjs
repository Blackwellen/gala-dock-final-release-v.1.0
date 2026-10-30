// Browser-emulated device checks. These never constitute physical-device or installed-PWA certification.
import fs from "node:fs/promises";
import { chromium, webkit, firefox, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3120";
const tabletTargets = process.argv.includes("--tablet-targets"), finalFixes = tabletTargets || process.argv.includes("--final-fixes"), recheck = finalFixes || process.argv.includes("--affected");
const output = tabletTargets ? "artifacts/pwa/device-certification-tablets" : finalFixes ? "artifacts/pwa/device-certification-final" : recheck ? "artifacts/pwa/device-certification-recheck" : "artifacts/pwa/device-certification"; await fs.mkdir(output, { recursive: true });
const profiles = [
  { name: "iPhone 13 Mini", engine: "webkit" }, { name: "iPhone 13", engine: "webkit" }, { name: "iPad Mini", engine: "webkit" },
  { name: "Pixel 5", engine: "chromium" }, { name: "Galaxy Tab S4", engine: "chromium" },
  { name: "Firefox responsive viewport", engine: "firefox", options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
];
const routes = recheck ? { organizer: ["/organizer/events"], provider: ["/provider/bookings"], admin: ["/admin/health"] } : { customer: ["/account", "/account?tab=security", "/account/tickets"], organizer: ["/organizer", "/organizer/events", "/organizer/media"], provider: ["/provider/bookings", "/provider/money", "/provider/settings"], admin: ["/admin/users", "/admin/workspaces", "/admin/health"] };
if (finalFixes) delete routes.provider;
if (tabletTargets) delete routes.admin;
const labels = { customer: ["Discover", "Plan", "My Events", "My Tickets", "Menu"], organizer: ["Home", "Events", "Calendar", "Marketplace", "Menu"], provider: ["Home", "Bookings", "Calendar", "Listings", "Menu"], admin: ["Overview", "Users", "Workspaces", "Events", "Menu"] };
const report = { observedUtc: new Date().toISOString(), base, scope: `${tabletTargets ? 2 : finalFixes ? 24 : recheck ? 36 : 144} browser-emulated route/device/orientation cases; Safari behavior approximated by WebKit, not physical iOS; Firefox is a responsive desktop viewport`, axeExclusion: "Incidental noninteractive .ml-thumb[aria-hidden=true] artwork only; library controls remain included", results: [] };
const caseKey = row => JSON.stringify([row.profile, row.orientation, row.role, row.route]);
if (process.argv.includes("--resume")) {
  const previous = JSON.parse(await fs.readFile(`${output}/report.json`, "utf8"));
  report.results = previous.results; report.resumedFromUtc = previous.observedUtc;
}
const completed = new Set(report.results.map(caseKey));
const persist = async () => {
  for (let attempt = 0; ; attempt++) {
    try { await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); return; }
    catch (error) { if (attempt >= 5 || !["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(error.code)) throw error; await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); }
  }
};
const axe = page => new AxeBuilder({ page }).exclude('.ml-thumb[aria-hidden="true"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
for (const profile of tabletTargets ? profiles.filter(p => ["iPad Mini", "Galaxy Tab S4"].includes(p.name)) : profiles) {
  const browser = await ({ chromium, webkit, firefox }[profile.engine]).launch(profile.engine === "chromium" ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {});
  try {
    for (const [role, paths] of Object.entries(routes)) for (const orientation of tabletTargets ? ["landscape"] : ["portrait", "landscape"]) {
      const options = profile.options ?? devices[profile.name + (orientation === "landscape" ? " landscape" : "")];
      if (!options) throw new Error(`Missing device profile ${profile.name}`);
      const viewport = profile.options && orientation === "landscape" ? { width: options.viewport.height, height: options.viewport.width } : options.viewport;
      const ctx = await browser.newContext({ ...options, viewport, storageState: `artifacts/auth/pwa-resume-${role}.json`, reducedMotion: "reduce", timezoneId: "Europe/London", locale: "en-GB" });
      try {
        const page = await ctx.newPage();
        for (const route of paths) {
          if (completed.has(caseKey({ profile: profile.name, orientation, role, route }))) continue;
          const row = { profile: profile.name, engine: profile.engine, engineVersion: browser.version(), orientation, role, route, requestedViewport: viewport, issues: [] }, errors = [];
          const onError = error => errors.push(error.message); page.on("pageerror", onError);
          try {
            const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 60_000 });
            await page.locator("h1").first().waitFor({ timeout: 30_000 });
            await page.waitForFunction(() => !document.querySelector(".pwa-route-loading"), null, { timeout: 30_000 });
            await page.evaluate(() => document.fonts.ready);
            if (response?.status() !== 200 || new URL(page.url()).pathname !== new URL(base + route).pathname) row.issues.push("Wrong route/status or authentication redirect");
            row.geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth - innerWidth, nav: document.querySelector(".pwa-tabs")?.getBoundingClientRect().toJSON() }));
            if (row.geometry.overflow > 1) row.issues.push(`Page overflow ${row.geometry.overflow}px`);
            if (route === "/organizer/events") {
              row.viewTargets = await page.locator(".ev-tabs-row .k-seg > a").evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { width: b.width, height: b.height }; }));
              if (finalFixes && row.viewTargets.some(target => target.width < 43.5 || target.height < 43.5)) row.issues.push("View control below 44px touch target");
            }
            const nav = page.getByRole("navigation", { name: "Primary", exact: true });
            const actual = (await nav.locator("a>span,button>span").allTextContents()).map(s => s.trim());
            if (JSON.stringify(actual) !== JSON.stringify(labels[role])) row.issues.push("Incorrect five-option navigation");
            if (!row.geometry.nav || Math.abs(row.geometry.nav.bottom - row.geometry.height) > 1) row.issues.push("Navigation not anchored to viewport");
            row.axe = (await axe(page)).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
            if (row.axe.length) row.issues.push("Page axe violations");
            await page.getByRole("button", { name: "Menu", exact: true }).click();
            const menu = page.getByRole("dialog", { name: "Menu", exact: true }); await menu.waitFor();
            row.menu = await menu.evaluate(el => ({ columns: getComputedStyle(el.querySelector(".pwa-grid")).gridTemplateColumns.split(" ").length, focusInside: el.contains(document.activeElement), top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
            if (row.menu.columns !== 3 || !row.menu.focusInside || row.menu.top < -1 || row.menu.bottom > row.geometry.height + 1) row.issues.push("Menu geometry or initial focus failed");
            row.menuAxe = (await axe(page)).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
            if (row.menuAxe.length) row.issues.push("Menu axe violations");
            await page.keyboard.press("Escape");
            if (await menu.isVisible() || !await page.getByRole("button", { name: "Menu", exact: true }).evaluate(el => el === document.activeElement)) row.issues.push("Menu Escape/focus return failed");
            if (route === paths[0]) await page.screenshot({ path: `${output}/${profile.name.replaceAll(" ", "-")}-${role}-${orientation}.png`, animations: "disabled" });
          } catch (error) { row.issues.push(String(error.message).split("\n")[0]); }
          finally { page.off("pageerror", onError); row.pageErrors = errors; if (errors.length) row.issues.push("Runtime page errors"); }
          report.results.push(row); console.log(`${row.issues.length ? "FAIL" : "PASS"} ${profile.name} ${orientation} ${role} ${route}${row.issues.length ? ": " + row.issues.join("; ") : ""}`);
          await persist();
        }
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
}
console.log(`${report.results.filter(r => !r.issues.length).length}/${report.results.length} cases clean`);
if (report.results.some(r => r.issues.length)) process.exitCode = 1;
