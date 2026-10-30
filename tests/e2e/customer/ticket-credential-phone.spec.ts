import { test, expect } from "@playwright/test";
import { login, admin } from "../p2-helpers";

// Owner phone check: the entry QR is square and centred in its card, and the barcode is never stretched (rendered width ≤ its
// natural width, height 90 — 70 in compact), across phone widths and the QR / Ticket / Barcode modes. Demo customer tickets.
const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 1536];
let ids: string[] = [];
test.beforeAll(async () => {
  const db = admin(); const { data: us } = await db.auth.admin.listUsers({ perPage: 1000 }); const cust = us.users.find(u => u.email === "alex.thompson@example.com")!.id;
  const { data } = await db.from("tickets").select("id,status").eq("holder_id", cust).eq("status", "valid").limit(2);
  ids = (data ?? []).map(t => t.id as string);
});

for (const w of WIDTHS) {
  test(`ticket credential at ${w}px: QR square + centred, barcode not stretched`, async ({ browser }) => {
    test.skip(!ids.length, "demo customer has no valid ticket");
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 1024 }, isMobile: w < 500, hasTouch: w < 1100 });
    const page = await ctx.newPage();
    await login(page, "customer", `/account/tickets/${ids[0]}`);
    await page.goto(`/account/tickets/${ids[0]}`);
    for (const mode of ["QR", "Ticket", "Barcode"]) {
      const tab = page.getByRole("tab", { name: new RegExp(`^${mode}`, "i") }).first();
      if (await tab.count()) await tab.click();
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const r = (el: Element) => el.getBoundingClientRect();
        const qr = [...document.querySelectorAll(".tc-qr svg, .tc-qr img")].map(q => { const b = r(q); const c = r(q.closest(".tc-card, .tc-mini, .tc-compact, .tc")!); return { square: Math.abs(b.width - b.height) <= 1, d: Math.abs(b.left + b.width / 2 - (c.left + c.width / 2)) }; });
        const bar = [...document.querySelectorAll<SVGSVGElement>(".tc-barcode svg")].map(s => { const b = r(s); const nat = s.viewBox.baseVal?.width || parseFloat(s.getAttribute("width") ?? "0"); return { stretched: b.width > nat + 1, h: Math.round(b.height) }; });
        return { over: document.documentElement.scrollWidth > innerWidth + 1, qr, bar };
      });
      expect(m.over, `${mode} overflow`).toBe(false);
      for (const q of m.qr) { expect(q.square, `${mode} QR square`).toBe(true); expect(q.d, `${mode} QR centre offset`).toBeLessThanOrEqual(2); }
      for (const b of m.bar) { expect(b.stretched, `${mode} barcode stretched`).toBe(false); expect([90, 70]).toContain(b.h); }
    }
    await ctx.close();
  });
}
