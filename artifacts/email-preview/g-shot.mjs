import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const [w, h] of [[1440, 1000], [390, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("https://www.galadock.com/login", { waitUntil: "load" }); await p.waitForTimeout(2500);
  const btn = p.getByRole("button", { name: "Continue with Google" }), card = p.locator(".auth-card");
  const [bb, cb] = [await btn.boundingBox(), await card.boundingBox()];
  console.log(w, "button", Math.round(bb.x - cb.x), "from left,", Math.round(cb.x + cb.width - bb.x - bb.width), "from right");
  await btn.scrollIntoViewIfNeeded(); await p.screenshot({ path: `artifacts/email-preview/login-google-${w}.png` }); await p.close();
}
await b.close();
