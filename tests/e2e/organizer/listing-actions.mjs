// E2E: listing-page actions for organisers and customers — message the provider (opens a conversation in the inbox),
// conditional hold and emergency requests carry through the request wizard, Gala Agent answers about this listing,
// and the customer page's hold / enquire / availability work. Conversations it creates are removed afterwards.
// Usage: node --env-file=.env --env-file=.env.local tests/e2e/organizer/listing-actions.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const VENUE = "327451a6-0693-47f6-bbec-a480fe805db5";   // Riverside Arena (emergency supply)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const started = new Date().toISOString();
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errs = [];
const page = async who => { const p = await (await b.newContext({ storageState: `artifacts/auth/${who}.json`, viewport: { width: 1440, height: 900 } })).newPage(); p.on("pageerror", e => errs.push(e.message)); return p; };
try {
  const o = await page("organizer");
  const url = `${BASE}/organizer/marketplace/venue/${VENUE}`;
  await o.goto(url, { waitUntil: "load", timeout: 120000 });
  // Message venue → dialog → inbox conversation.
  await o.getByRole("button", { name: "Message venue" }).click();
  const dlg = o.getByRole("dialog");
  check("Message opens a dialog with the enquiry subject", /Enquiry about Riverside Arena/.test(await dlg.innerText()));
  await dlg.getByRole("textbox", { name: "Message" }).fill("Hi — is the main hall free for our awards night?");
  await dlg.getByRole("button", { name: "Send message" }).click();
  await o.waitForURL(/\/organizer\/inbox\?c=/, { timeout: 30000 });
  check("Sending opens the conversation in the inbox", (await o.locator(".ms-msgs").innerText()).includes("main hall free"));
  // Hold + emergency carry through the wizard.
  for (const [btn, flag, expect] of [["Request with conditional hold", "hold", /Conditional hold requested/], ["Emergency request", "emergency", /Emergency request\./]]) {
    await o.goto(url, { waitUntil: "load" }); await o.getByRole("link", { name: btn }).click();
    await o.waitForURL(new RegExp(`${flag}=1`)); check(`${btn}: step 1 says so`, expect.test(await o.locator("form.wz-grid").innerText()));
    await o.locator("input[required]").first().fill(`E2E ${flag} request`).catch(() => {});
    await o.getByRole("button", { name: /Continue to recipients/ }).click(); await o.waitForURL(/step=2/, { timeout: 30000 });
    check(`${btn}: flag kept on step 2`, o.url().includes(`${flag}=1`));
    const sw = o.locator(".k-between", { hasText: flag === "hold" ? "Conditional hold" : "Emergency request" }).getByRole("switch");
    check(`${btn}: switch is on`, (await sw.getAttribute("aria-checked")) === "true");
  }
  await o.goto(url, { waitUntil: "load" }); await o.getByRole("link", { name: "Request availability" }).first().click(); await o.waitForURL(/step=1/);
  await o.getByRole("button", { name: /Continue to recipients/ }).click(); await o.waitForURL(/step=2/, { timeout: 30000 });
  check("Plain request starts with the hold off", (await o.locator(".k-between", { hasText: "Conditional hold" }).getByRole("switch").getAttribute("aria-checked")) === "false");
  // Gala Agent knows which listing it is.
  await o.goto(url, { waitUntil: "load" });
  await o.getByPlaceholder("Ask about Riverside Arena...").fill("What is this venue's capacity, and does it offer emergency supply?"); await o.getByPlaceholder("Ask about Riverside Arena...").press("Enter");
  const reply = o.locator(".k-agent-reply").last(); await reply.waitFor({ timeout: 60000 });
  const txt = await reply.innerText(), html = await reply.innerHTML();
  check("Gala Agent answers about this listing (its real capacity)", /400/.test(txt) && !/Riverside Park/i.test(txt), txt.replace(/\s+/g, " ").slice(0, 120));
  check("Agent reply is formatted (no raw ## or **)", !/(^|\n)#{1,6}\s|\*\*/.test(txt) && /<(p|ul|ol|b|strong)/.test(html));
  // Customer listing page.
  const c = await page("customer");
  const { data: l } = await admin.from("listings").select("slug,kind").eq("id", VENUE).single();
  await c.goto(`${BASE}/venues/${l.slug ?? VENUE}`, { waitUntil: "load", timeout: 120000 });
  await c.locator(".pl-plan").waitFor();
  await c.locator(".pl-fit[role=status]").waitFor({ timeout: 30000 }).catch(() => {});
  check("Customer page shows availability on the event date", /your (event )?date/i.test(await c.locator(".pl-plan").innerText()));
  await c.getByRole("button", { name: "Enquire" }).click();
  check("Enquire opens the message dialog", await c.getByRole("dialog").getByRole("textbox", { name: "Message" }).isVisible());
  await c.keyboard.press("Escape");
  await c.getByRole("button", { name: "Conditional hold" }).click();
  await c.waitForURL(/option=hold/, { timeout: 30000 });
  check("Conditional hold opens booking with the hold option", c.url().includes("option=hold"));
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  const { data: convs } = await admin.from("conversations").select("id").gte("created_at", started);
  if (convs?.length) await admin.from("conversations").delete().in("id", convs.map(x => x.id));
  await b.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
