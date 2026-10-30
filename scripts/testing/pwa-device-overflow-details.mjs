import { webkit, devices } from "@playwright/test";
const browser = await webkit.launch();
try {
  const role = process.argv[2] ?? "organizer", route = process.argv[3] ?? "/organizer/events", device = process.argv[4] ?? "iPhone 13 Mini landscape";
  const context = await browser.newContext({ ...devices[device], storageState: `artifacts/auth/pwa-resume-${role}.json` });
  const page = await context.newPage(); await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3120"}${route}`, { waitUntil: "networkidle" });
  console.log(JSON.stringify(await page.locator(".adb-table").evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { tabindex: el.getAttribute("tabindex"), focusable: el.tabIndex, width: el.clientWidth, scrollWidth: el.scrollWidth, overflow: s.overflowX, parent: el.parentElement?.className }; })), null, 2));
  console.log(JSON.stringify(await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, elements: [...document.querySelectorAll("main *")].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.right > innerWidth + 1 && !el.closest("table,svg"); }).slice(0, 18).map(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { tag: el.tagName, class: el.className, parent: el.parentElement?.className, right: r.right, width: r.width, minWidth: s.minWidth, display: s.display, whiteSpace: s.whiteSpace }; }) })), null, 2));
} finally { await browser.close(); }
