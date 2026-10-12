// E2E: Help Centre inside each shell + Contact support. Usage: node --env-file=.env --env-file=.env.local tests/e2e/help/help-centre.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errs = [], made = [];
try {
  // Public, signed out: public header, guides, email fallback.
  { const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on("pageerror", e => errs.push(e.message));
    await p.goto(`${BASE}/help`, { waitUntil: "load" });
    check("Public /help has the public header", await p.locator("header").first().isVisible());
    check("Public /help lists guides", (await p.locator(".hc-group li").count()) > 5);
    check("Signed-out contact offers sign-in and email", await p.getByRole("link", { name: "support@galadock.com" }).first().isVisible());
    await p.screenshot({ path: "artifacts/tmp/help-public.png" }); await c.close(); }

  for (const [persona, base, shellSel, aud] of [["provider", "/provider/help", ".ws-topbar", "For providers"], ["organizer", "/organizer/help", ".o-top", "For organizers"], ["customer", "/account/help", ".c-root", "For customers"]]) {
    const c = await browser.newContext({ storageState: `artifacts/auth/${persona}.json`, viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on("pageerror", e => errs.push(`${persona}: ${e.message}`));
    await p.goto(`${BASE}${persona === "customer" ? "/home" : `/${persona}`}`, { waitUntil: "load" });
    const help = p.locator(`a[aria-label="Help"][href="${base}"]`).first();
    check(`${persona}: Help button points to ${base}`, await help.count() > 0);
    await p.goto(`${BASE}${base}`, { waitUntil: "load" });
    check(`${persona}: help centre renders inside the shell`, await p.locator(shellSel).first().isVisible() && await p.getByRole("heading", { name: "How can we help?" }).isVisible());
    check(`${persona}: own audience listed first`, (await p.locator(".hc-group h2").first().textContent())?.trim() === aud);
    await p.screenshot({ path: `artifacts/tmp/help-${persona}.png` });
    // Open an article and keep the shell.
    await p.locator(".hc-group a").first().click(); await p.waitForURL(new RegExp(`${base}/[a-z0-9-]+$`));
    check(`${persona}: article opens under ${base}`, await p.locator(".hc-article h1").isVisible());
    if (persona === "provider") {
      await p.getByLabel("What’s it about?").selectOption("payment");
      await p.getByLabel("Subject").fill("E2E help test — payout timing");
      await p.getByLabel("How can we help?").fill("Automated test from the Help Centre contact form. Please ignore.");
      await p.getByRole("button", { name: "Send to support" }).click();
      await p.getByText(/Message sent — case SUP-\d+/).waitFor({ timeout: 20000 });
      const ref = (await p.getByText(/Message sent — case SUP-\d+/).textContent()).match(/SUP-\d+/)[0]; made.push(ref);
      const { data: k } = await admin.from("support_cases").select("id,category,priority,workspace_id,related,requester_id").eq("reference", ref).single();
      const { data: m } = await admin.from("support_messages").select("body").eq("case_id", k.id);
      check("Support case created with category, priority, workspace and first message", k.category === "payment" && k.priority === "high" && !!k.workspace_id && m.length === 1, `${ref} ${k.related?.source}`);
      await p.reload({ waitUntil: "load" });
      check("Case shows under Your requests", await p.locator(".hc-cases").getByText(ref).isVisible());
    }
    await c.close();
  }
  check("No page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  for (const ref of made) { const { data: k } = await admin.from("support_cases").select("id").eq("reference", ref).single(); if (k) { await admin.from("support_messages").delete().eq("case_id", k.id); await admin.from("support_cases").delete().eq("id", k.id); } }
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
