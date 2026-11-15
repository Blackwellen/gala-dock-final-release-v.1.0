// R1 signed-in lane: disposable partner + promoter identities (tests/phase1/helpers.ts createUser pattern), signed in through the
// real password UI, storage states saved to artifacts/auth/r1-partner.json / r1-promoter.json. `cleanup` removes every row + user.
// Usage: node --env-file=.env --env-file=.env.local scripts/qa/r1-fixtures.mjs setup|cleanup
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = "Gala-Dock-Test-9!";
const LEDGER = "artifacts/release/r1/fixtures.json";
const mode = process.argv[2];

if (mode === "setup") {
  const made = { users: [], partners: [], promoters: [] };
  const user = async label => {
    const email = `p1-r1-${label}-${randomBytes(4).toString("hex")}@gala-dock.test`;
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `R1 ${label}`, terms_version: "2026-10" } });
    if (error) throw error; made.users.push(data.user.id); return { id: data.user.id, email };
  };
  try {
    const tag = randomBytes(3).toString("hex").toUpperCase();
    const pu = await user("partner");
    const p = await db.from("partners").insert({ user_id: pu.id, name: `R1 Partner ${tag}`, kind: "affiliate", status: "active", referral_code: `R1P${tag}` }).select("id").single();
    if (p.error) throw p.error; made.partners.push(p.data.id);
    // promoter: attached to one of the demo organiser's own events (demo data), removed on cleanup
    const ev = (await db.from("events").select("id,name").eq("slug", "elite-sounds-night").maybeSingle()).data;
    const mu = await user("promoter");
    if (ev) {
      const pr = await db.from("promoters").insert({ event_id: ev.id, user_id: mu.id, name: `R1 Promoter ${tag}`, code: `R1M${tag}`, commission_pct: 10, status: "active", email: "" }).select("id").single();
      if (pr.error) throw pr.error; made.promoters.push(pr.data.id);
    }
    fs.mkdirSync("artifacts/release/r1", { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1));
    const browser = await chromium.launch({ args: ["--disable-gpu"] });
    try {
      for (const [who, u, land] of [["partner", pu, "/partner"], ["promoter", mu, "/promoter"]]) {
        const ctx = await browser.newContext(); await ctx.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const server = ws.connectToServer(); server.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); }); const page = await ctx.newPage();
        await page.goto(`${BASE}/login?next=${encodeURIComponent(land)}`, { waitUntil: "domcontentloaded", timeout: 180000 });
        await page.fill('input[name="email"]', u.email); await page.fill('input[name="password"]', PASSWORD);
        await page.locator('button[type="submit"]:not([disabled])').first().click();
        await page.waitForURL(x => !x.pathname.startsWith("/login"), { timeout: 120000 });
        if (!new URL(page.url()).pathname.startsWith(land)) await page.goto(BASE + land, { waitUntil: "domcontentloaded", timeout: 180000 });
        await ctx.storageState({ path: `artifacts/auth/r1-${who}.json` });
        console.log(`${who}: signed in → ${new URL(page.url()).pathname}`); await ctx.close();
      }
    } finally { await browser.close(); }
  } catch (e) { fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1)); throw e; }
} else if (mode === "social") {
  // Coordinator 2026-11-15 follow-up: a message from a second QA identity to the demo provider (so Report shows on someone
  // else's message) and one published review on a demo provider listing by a QA customer (so the reply form shows).
  const made = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const listing = (await db.from("listings").select("id,workspace_id,name").eq("id", "327451a6-0693-47f6-bbec-a480fe805db5").single()).data;
  const email = `p1-r1-social-${randomBytes(4).toString("hex")}@gala-dock.test`;
  const u = (await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "R1 QA Guest", terms_version: "2026-10" } })).data.user;
  const since = new Date().toISOString();
  const rv = await db.from("reviews").insert({ user_id: u.id, listing_id: listing.id, rating: 4, body: "R1 QA review — disposable fixture, removed after the check.", status: "published" }).select("id").single();
  if (rv.error) throw rv.error;
  const cv = (await db.from("conversations").insert({ kind: "direct", subject: "R1 QA message", created_by: u.id }).select("id").single()).data;
  await db.from("conversation_participants").insert([{ conversation_id: cv.id, user_id: u.id }, { conversation_id: cv.id, workspace_id: listing.workspace_id }]);
  const ms = (await db.from("conversation_messages").insert({ conversation_id: cv.id, sender_id: u.id, sender_name: "R1 QA Guest", body: "R1 QA message — disposable fixture for the Report check." }).select("id").single()).data;
  made.social = { user: u.id, review: rv.data.id, listing: listing.id, workspace: listing.workspace_id, conversation: cv.id, message: ms.id, since };
  fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1)); console.log(JSON.stringify(made.social));
} else if (mode === "event") {
  // A buyable Stripe-TEST event: the QA fixture organiser workspace "S4 Organiser" already has a charges-enabled TEST connected
  // account (DEC-107 sandbox proof). One public on-sale event + one £10 GA tier, made through the audited fixture RPC; hidden
  // again (private) right after the purchase and on cleanup.
  const made = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const WS = "e2722ab1-045d-408e-93d6-a24cf7c54ce6";
  const ca = (await db.from("connect_accounts").select("stripe_account_id,livemode,charges_enabled").eq("workspace_id", WS).maybeSingle()).data;
  if (!ca || ca.livemode !== false || !ca.charges_enabled) throw new Error("fixture workspace has no charges-enabled TEST connected account");
  const owner = (await db.from("workspaces").select("owner_id").eq("id", WS).single()).data.owner_id;
  const slug = `r1-qa-${randomBytes(3).toString("hex")}`, iso = d => new Date(Date.now() + d * 864e5).toISOString();
  const r = await db.rpc("service_insert_event", { p_row: { workspace_id: WS, owner_id: owner, management: "professional", name: "R1 QA test event", slug, visibility: "public", status: "on_sale", event_type: "concert",
    description: "Disposable R1 QA event (Stripe test mode).", starts_at: iso(30), ends_at: iso(30.2), city: "London", venue_name: "QA Hall" }, p_reason: "spec fixture: R1 signed-in QA checkout confirmation" }).select("id").single();
  if (r.error) throw r.error;
  const t = await db.from("ticket_tiers").insert({ event_id: r.data.id, name: "General admission", price: 10, quantity: 50, status: "on_sale" }).select("id").single();
  if (t.error) throw t.error;
  made.event = { id: r.data.id, slug, tier: t.data.id, workspace: WS, account: ca.stripe_account_id };
  fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1)); console.log(`event: ${slug}`);
} else if (mode === "purchase") {
  // Coordinator 2026-11-15: make checkout confirmation and ticket-accept reachable. As the demo customer, buy ONE ticket on the
  // QA demo event in Stripe TEST mode (card 4242; refuses anything but a cs_test_ session), then offer it to the disposable
  // promoter identity so /tickets/accept/<token> exists. Everything is recorded in the ledger for cleanup.
  const made = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const recipient = (await db.auth.admin.getUserById(made.users[1])).data.user; // the disposable promoter identity created by setup
  const browser = await chromium.launch({ args: ["--disable-gpu"] });
  try {
    const st = JSON.parse(fs.readFileSync("artifacts/auth/r1-customer.json", "utf8")); st.cookies.push({ name: "gd_cc", value: "1", domain: new URL(BASE).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" });
    const ctx = await browser.newContext({ storageState: st, viewport: { width: 1440, height: 1000 } });
    await ctx.routeWebSocket(/_next\/(webpack-)?hmr|turbopack-hmr/, ws => { const server = ws.connectToServer(); server.onMessage(m => { if (typeof m === "string" && /"reloadPage"|"type":"restart"/.test(m)) return; ws.send(m); }); });
    const page = await ctx.newPage();
    const slug = made.event?.slug ?? "comedy-central-live";
    await page.goto(`${BASE}/checkout/${slug}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(1500);
    await page.locator("button[aria-label^='More ']:not([disabled])").first().click();
    await page.locator("button.co-cta:not([disabled])").first().click();
    await page.locator(".co-review").waitFor({ timeout: 60000 });
    const tick = page.locator("input[type=checkbox]"); for (let i = 0; i < await tick.count(); i++) if (await tick.nth(i).isVisible()) await tick.nth(i).check({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const pay = page.locator("button.co-cta:not([disabled])").first();
    if (!(await pay.isVisible({ timeout: 15000 }).catch(() => false))) { await page.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/claude/6e60ed90514f9a6a/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/r1/pay.png", fullPage: true }); console.log(await page.locator("aside").innerText().catch(() => "")); throw new Error("Pay button stayed disabled"); }
    await pay.click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90000 });
    if (!page.url().includes("cs_test_")) throw new Error("Refusing payment: not a Stripe test-mode Checkout session.");
    await page.waitForLoadState("load").catch(() => {}); await page.waitForTimeout(4000);
    await page.getByTestId("card-accordion-item").click({ timeout: 10000 }).catch(() => {});
    await page.getByRole("radio", { name: /^Card$/ }).check({ timeout: 5000 }).catch(() => {}); for (const sel of ['[data-testid="card-accordion-item-button"]', 'button[aria-label*="Card" i]', 'input[value="card"]', '#payment-method-accordion-item-title-card']) { const l = page.locator(sel).first(); if (await l.count()) { await l.click({ force: true }).catch(() => {}); break; } }
    if (!(await page.locator("#cardNumber").isVisible().catch(() => false))) { const b = await page.getByText("Card", { exact: true }).first().boundingBox().catch(() => null); if (b) await page.mouse.click(b.x - 50, b.y + b.height / 2); }
    await page.waitForTimeout(2000);
    // Checkout may render the card fields directly (#cardNumber) or inside a Payment Element iframe (autocomplete cc-*).
    const fillCard = async () => {
      if (await page.locator("#cardNumber").isVisible().catch(() => false)) { await page.locator("#cardNumber").fill("4242424242424242"); await page.locator("#cardExpiry").fill("12 / 34"); await page.locator("#cardCvc").fill("123"); return true; }
      for (const f of page.frames()) { const n = f.locator('input[autocomplete="cc-number"], input[name="number"]'); if (await n.count().catch(() => 0)) { await n.first().fill("4242424242424242"); await f.locator('input[autocomplete="cc-exp"], input[name="expiry"]').first().fill("12 / 34"); await f.locator('input[autocomplete="cc-csc"], input[name="cvc"]').first().fill("123"); const pc = f.locator('input[autocomplete="postal-code"]'); if (await pc.count()) await pc.first().fill("SE1 9PP"); return true; } }
      return false;
    };
    const openCard = async () => { for (const f of page.frames()) { const c = f.getByText("Card", { exact: true }); if (await c.count().catch(() => 0)) { await c.first().click({ timeout: 3000 }).catch(() => {}); } } };
    let filled = false; for (let i = 0; i < 10 && !filled; i++) { filled = await fillCard(); if (!filled) { await openCard(); await page.waitForTimeout(1500); } }
    if (!filled) { await page.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/claude/6e60ed90514f9a6a/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/r1/stripe.png", fullPage: true }); throw new Error("Stripe card field not found"); }
    const nm = page.locator("#billingName"); if (await nm.count()) await nm.fill("R1 QA Customer");
    const pc = page.locator("#billingPostalCode"); if (await pc.count()) await pc.fill("SE1 9PP");
    const submit = page.getByTestId("hosted-payment-submit-button"); if (await submit.count()) await submit.click(); else { for (const f of page.frames()) { const n = f.locator('input[autocomplete="cc-name"], input[name="billingName"]'); if (await n.count().catch(() => 0)) await n.first().fill("R1 QA Customer").catch(() => {}); }
      let done = false; for (const f of page.frames()) { const b = f.locator('button[type="submit"]').filter({ hasText: /^\s*Pay\s*$/ }); if (await b.count().catch(() => 0)) { await b.first().click({ timeout: 10000 }); done = true; break; } }
      if (!done) { await page.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/claude/6e60ed90514f9a6a/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/r1/stripe.png", fullPage: true }); throw new Error("Stripe Pay button not found"); } }
    await page.waitForURL(/\/confirmation\?order=GD-/, { timeout: 120000 }).catch(async e => { await page.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/claude/6e60ed90514f9a6a/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/r1/stripe.png", fullPage: true }); console.log("at", page.url().slice(0, 120)); throw e; });
    const confirmation = new URL(page.url()); const order = confirmation.searchParams.get("order");
    made.purchase = { order, confirmation: confirmation.pathname + confirmation.search, card: "4242 (Stripe test)", event: slug };
    fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1)); console.log(`purchase: ${order}`);
    const ticket = (await db.from("tickets").select("id").eq("order_ref", order).limit(1).single()).data;
    made.purchase.ticket = ticket.id; fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1));
    await page.goto(`${BASE}/account/tickets/${ticket.id}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Transfer ticket/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input[autocomplete=name]").fill("R1 Promoter"); await dlg.locator("input[type=email]").fill(recipient.email);
    await dlg.getByRole("button", { name: /Send transfer offer/ }).click();
    const link = await dlg.locator(".tk-acc code").textContent({ timeout: 60000 });
    const tr = (await db.from("ticket_transfers").select("id").eq("ticket_id", ticket.id).order("created_at", { ascending: false }).limit(1).single()).data;
    made.transfer = { id: tr?.id, accept: new URL(link).pathname, to: "disposable promoter identity" };
    fs.writeFileSync(LEDGER, JSON.stringify(made, null, 1)); console.log(`transfer: ${made.transfer.accept}`);
    await ctx.storageState({ path: "artifacts/auth/r1-customer.json" }); await ctx.close();
    if (made.event?.id) await db.rpc("service_update_events", { p_ids: [made.event.id], p_patch: { visibility: "private" }, p_reason: "spec fixture: R1 hide after purchase" });
  } finally { await browser.close(); }
} else if (mode === "cleanup") {
  const made = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  if (made.event?.id) console.log("event hidden", (await db.rpc("service_update_events", { p_ids: [made.event.id], p_patch: { visibility: "private" }, p_reason: "spec fixture: R1 cleanup" })).error?.message ?? "ok");
  if (made.social && !made.social.cleaned) {
    const so = made.social;
    const cases = ((await db.from("trust_cases").select("id").eq("subject_id", so.user)).data ?? []).map(c => c.id);
    for (const c of cases) console.log("report notifications", (await db.from("notifications").delete().like("dedupe_key", `msg-report-case:${c}:%`)).error?.message ?? "deleted");
    if (cases.length) console.log("trust cases", (await db.from("trust_cases").delete().in("id", cases)).error?.message ?? "deleted");
    console.log("message reports", (await db.from("message_reports").delete().eq("message_id", so.message)).error?.message ?? "deleted");
    console.log("message notifications", (await db.from("notifications").delete().like("link", `%${so.conversation}%`)).error?.message ?? "deleted");
    console.log("review notifications", (await db.from("notifications").delete().eq("workspace_id", so.workspace).gte("created_at", so.since).like("link", "%review%")).error?.message ?? "deleted");
    console.log("conversation", (await db.from("conversations").delete().eq("id", so.conversation)).error?.message ?? "deleted");
    console.log("review", (await db.from("reviews").delete().eq("id", so.review)).error?.message ?? "deleted");
    console.log("social user", (await db.auth.admin.deleteUser(so.user)).error?.message ?? "deleted");
    so.cleaned = new Date().toISOString();
  }
  if (made.transfer?.id) console.log("transfer", (await db.from("ticket_transfers").delete().eq("id", made.transfer.id)).error?.message ?? "deleted");
  if (made.promoters?.length) console.log("promoters", (await db.from("promoters").delete().in("id", made.promoters)).error?.message ?? "deleted");
  if (made.partners?.length) console.log("partners", (await db.from("partners").delete().in("id", made.partners)).error?.message ?? "deleted");
  for (const id of made.users ?? []) console.log("user", (await db.auth.admin.deleteUser(id)).error?.message ?? "deleted");
  for (const w of ["partner", "promoter"]) fs.rmSync(`artifacts/auth/r1-${w}.json`, { force: true });
  // the ledger stays as the record of what was created (the test-mode order stays on the QA demo event as a sold ticket)
  fs.writeFileSync(LEDGER, JSON.stringify({ ...made, cleaned_at: new Date().toISOString() }, null, 1));
} else console.log("usage: setup | social | event | purchase | cleanup");
