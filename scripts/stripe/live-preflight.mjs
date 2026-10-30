// Stripe go-live preflight (lane A2). READ-ONLY: Stripe GET requests only (enforced below) and Supabase SELECT/read-only RPCs only.
// Prints PASS / FAIL / WARN / INFO per item and never prints a secret (only key MODE prefixes and Stripe object ids).
// Exit code 1 when any item FAILs.
//
// The mode is derived exactly like the app (src/lib/payments/stripe-mode.ts): STRIPE_CONNECT_SECRET_KEY, or outside production
// STRIPE_SECRET_KEY_SANDBOX. Run it with the environment you are about to deploy:
//   test (local):  node --env-file=.env --env-file=.env.local scripts/stripe/live-preflight.mjs
//   production:    vercel env pull .env.production.local --environment=production   (owner; file is git-ignored — delete after)
//                  NODE_ENV=production node --env-file=.env.production.local scripts/stripe/live-preflight.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PLATFORM, CONNECT, WEBHOOK_URL } from "./webhook-events.mjs";

const env = process.env;
const modeOf = k => !k ? "unconfigured" : /^(sk|rk)_live_[A-Za-z0-9]/.test(k) ? "live" : /^(sk|rk)_test_[A-Za-z0-9]/.test(k) ? "test" : "unconfigured";
const pkModeOf = k => !k ? "unconfigured" : /^pk_live_/.test(k) ? "live" : /^pk_test_/.test(k) ? "test" : "unconfigured";
const key = env.STRIPE_CONNECT_SECRET_KEY || (env.NODE_ENV !== "production" ? env.STRIPE_SECRET_KEY_SANDBOX : undefined);
const mode = modeOf(key);
const results = [];
const out = (status, item, detail = "") => { results.push({ status, item }); console.log(`${status.padEnd(4)}  ${item}${detail ? ` — ${detail}` : ""}`); };

/** Stripe GET only. Any other method is refused before a request is made. */
async function get(path, account) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: "GET", headers: { Authorization: `Bearer ${key}`, ...(account ? { "Stripe-Account": account } : {}) }, signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

console.log(`Gala Dock Stripe preflight · ${new Date().toISOString()} · read-only`);
// 1. key mode
console.log(`mode = ${mode}`);
if (mode === "unconfigured") { out("FAIL", "platform key", "STRIPE_CONNECT_SECRET_KEY (or STRIPE_SECRET_KEY_SANDBOX outside production) missing or not an sk_/rk_ key"); process.exit(1); }
out("PASS", "platform key mode", `${key.slice(0, 7)}… (${env.STRIPE_CONNECT_SECRET_KEY ? "STRIPE_CONNECT_SECRET_KEY" : "STRIPE_SECRET_KEY_SANDBOX fallback"})`);
const pk = mode === "live" ? [env.STRIPE_PUBLIC_KEY] : [env.STRIPE_PUBLIC_KEY_SANDBOX, env.STRIPE_PUBLIC_KEY];
const pkMatch = pk.find(k => pkModeOf(k) === mode);
out(pkMatch ? "PASS" : "FAIL", "publishable key matches mode", pkMatch ? `${pkMatch.slice(0, 7)}…` : `no pk_${mode}_ key in ${mode === "live" ? "STRIPE_PUBLIC_KEY" : "STRIPE_PUBLIC_KEY_SANDBOX / STRIPE_PUBLIC_KEY"}`);
if (env.STRIPE_SECRET_KEY) out("INFO", "STRIPE_SECRET_KEY is set", `mode ${modeOf(env.STRIPE_SECRET_KEY)}; the app never reads it for payments (only scripts/stripe-webhooks.mjs)`);
// STRIPE_CONNECT_SECRET_KEY is the go-live switch (the only platform key the app uses in production).
if (mode === "test" && modeOf(env.STRIPE_SECRET_KEY) === "live") out("INFO", "go-live switch not flipped", "STRIPE_SECRET_KEY holds the live key; STRIPE_CONNECT_SECRET_KEY is still test/unset → the app runs in TEST mode");

// 2. platform account + Connect
const acct = await get("account");
if (!acct.ok) out("FAIL", "platform account readable", `HTTP ${acct.status} ${acct.body?.error?.code ?? ""}`);
else {
  const a = acct.body;
  out("INFO", "platform account", `${a.id} ${a.country ?? ""} ${a.default_currency ?? ""}`);
  out(a.charges_enabled ? "PASS" : (mode === "live" ? "FAIL" : "WARN"), "platform charges_enabled (platform sales: boosts, plans)", String(!!a.charges_enabled));
  out(a.payouts_enabled ? "PASS" : (mode === "live" ? "FAIL" : "WARN"), "platform payouts_enabled", String(!!a.payouts_enabled));
  out(a.details_submitted ? "PASS" : (mode === "live" ? "FAIL" : "WARN"), "platform details_submitted (account activated)", String(!!a.details_submitted));
  out(a.settings?.dashboard?.display_name ? "PASS" : "WARN", "branding: dashboard display name", a.settings?.dashboard?.display_name ? "set" : "not set");
  out(a.settings?.branding?.icon || a.settings?.branding?.logo ? "PASS" : "WARN", "branding: icon/logo", a.settings?.branding?.icon || a.settings?.branding?.logo ? "set" : "not set");
  out(a.settings?.payments?.statement_descriptor ? "PASS" : "WARN", "statement descriptor", a.settings?.payments?.statement_descriptor ? "set" : "not set");
}
// The live account Gala Dock goes live on (owner rotated 2026-10-29; the 11 Oct Vercel values point at the OLD acct_1UP5bUASNGdjowJC).
const EXPECTED = { live: "acct_1UW16CArv3W3VbtP", test: "acct_1UW176Ae36uXyrUn" };   // sandbox moved 2026-10-29
if (acct.ok) out(acct.body.id === EXPECTED[mode] ? "PASS" : "FAIL", "key belongs to the expected account", `${acct.body.id} (expected ${EXPECTED[mode]})`);
// VAT: account tax ID (gb_vat) and an active GB Stripe Tax registration.
const taxIds = await get("tax_ids?limit=20");
const vat = taxIds.ok ? (taxIds.body.data ?? []).find(t => t.type === "gb_vat") : null;
out(vat ? "PASS" : "FAIL", "account tax ID gb_vat", vat ? `${vat.value} (${vat.id})` : taxIds.ok ? "none" : `HTTP ${taxIds.status}`);
const regs = await get("tax/registrations?limit=50");
const gb = regs.ok ? (regs.body.data ?? []).find(r => r.country === "GB" && r.status === "active") : null;
out(gb ? "PASS" : "FAIL", "Stripe Tax GB registration active", gb ? gb.id : regs.ok ? "none active" : `HTTP ${regs.status}`);
const connect = await get("accounts?limit=1");
out(connect.ok ? "PASS" : "FAIL", `Connect enabled (${mode})`, connect.ok ? "accounts list readable" : `HTTP ${connect.status} ${connect.body?.error?.message?.slice(0, 120) ?? ""}`);

// 3. webhook endpoints: exist, enabled, URL, mode, Connect flag, events ⊇ scripts/stripe/webhook-events.mjs, secret configured
const suffix = mode === "live" ? "" : "_SANDBOX";
for (const [kind, events, isConnect] of [["platform", PLATFORM, false], ["connect", CONNECT, true]]) {
  const idName = `STRIPE_WEBHOOK_ENDPOINT_ID${suffix}${isConnect ? "_CONNECT" : ""}`, secretName = `STRIPE_WEBHOOK_SECRET${suffix}${isConnect ? "_CONNECT" : ""}`;
  const id = env[idName];
  out(/^whsec_/.test(env[secretName] ?? "") ? "PASS" : "FAIL", `${kind} signing secret ${secretName}`, /^whsec_/.test(env[secretName] ?? "") ? "whsec_… configured" : "missing");
  if (!id) { out("FAIL", `${kind} endpoint id ${idName}`, "missing"); continue; }
  const e = await get(`webhook_endpoints/${encodeURIComponent(id)}`);
  if (!e.ok) { out("FAIL", `${kind} endpoint ${id}`, `HTTP ${e.status} ${e.body?.error?.code ?? ""}`); continue; }
  const w = e.body, missing = w.enabled_events.includes("*") ? [] : events.filter(x => !w.enabled_events.includes(x));
  out(w.status === "enabled" ? "PASS" : "FAIL", `${kind} endpoint ${id} enabled`, w.status);
  out(w.url === WEBHOOK_URL ? "PASS" : "FAIL", `${kind} endpoint URL`, w.url);
  out(w.livemode === (mode === "live") ? "PASS" : "FAIL", `${kind} endpoint mode`, w.livemode ? "live" : "test");
  out(!!w.application === isConnect ? "PASS" : "FAIL", `${kind} endpoint Connect flag`, w.application ? "connect" : "account");
  out(missing.length ? "FAIL" : "PASS", `${kind} endpoint events ⊇ ${events.length} required`, missing.length ? `missing ${missing.join(", ")}` : `${w.enabled_events.length} subscribed`);
}

// 4 + 5. database: price ids mapped for this mode, mode plumbing, no wrong-mode account ids used
const url = env.NEXT_PUBLIC_SUPABASE_URL, svc = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svc) out("FAIL", "database", "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
else {
  const db = createClient(url, svc, { auth: { persistSession: false }, global: { headers: { "x-gala-stripe-mode": mode } } });
  const col = mode === "live" ? "stripe_price_live" : "stripe_price_test";
  const [{ data: plans, error: pe }, { data: packs, error: ke }] = await Promise.all([
    db.from("plan_prices").select(`kind,plan,billing_interval,${col}`).eq("active", true).eq("self_serve", true),
    db.from("credit_packs").select(`name,active,${col}`).eq("active", true),
  ]);
  if (pe || ke) out("FAIL", "catalogue readable", (pe ?? ke).message);
  else {
    const rows = [...plans.map(p => ({ k: `gd_${p.kind}_${p.plan}_${p.billing_interval}`, id: p[col] })), ...packs.map(p => ({ k: `gd_pack_${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, id: p[col] }))];
    const unmapped = rows.filter(r => !r.id);
    // Plan / credit-pack billing runs in the key's mode (billingMode + priceFor, src/lib/billing/core.ts): an unmapped price refuses checkout.
    out(unmapped.length ? "FAIL" : "PASS", `price ids mapped for ${mode} (${rows.length})`, unmapped.length ? `unmapped: ${unmapped.map(r => r.k).join(", ")} — scripts/stripe/live-catalogue.mjs` : "all mapped");
    let bad = 0;
    for (const r of rows.filter(r => r.id).slice(0, 25)) {
      const p = await get(`prices/${encodeURIComponent(r.id)}`);
      if (!p.ok || !p.body.active || p.body.livemode !== (mode === "live")) { bad++; out("FAIL", `price ${r.k}`, `${r.id}: ${p.ok ? (p.body.active ? "wrong mode" : "inactive") : `HTTP ${p.status}`}`); }
    }
    if (rows.some(r => r.id)) out(bad ? "FAIL" : "PASS", `mapped prices exist in ${mode} and are active`, `${rows.filter(r => r.id).length - bad} ok`);
    const anyPrice = await get("prices?limit=1"), anyProduct = await get("products?limit=1");
    out("INFO", `catalogue objects on the ${mode} account`, `${anyProduct.body?.data?.length ? "has" : "no"} products, ${anyPrice.body?.data?.length ? "has" : "no"} prices${!anyPrice.body?.data?.length ? " — run scripts/stripe/live-catalogue.mjs" : ""}`);
    if (fs.existsSync("scripts/stripe/live-price-map.json")) out("INFO", "mapping file", "scripts/stripe/live-price-map.json present");
  }
  const m = await db.rpc("stripe_livemode");
  out(!m.error && m.data === (mode === "live") ? "PASS" : "FAIL", "DB honours the request mode header", m.error ? m.error.message : `stripe_livemode() = ${m.data}`);
  const { data: rec } = await db.from("stripe_platform_mode").select("livemode,source,updated_at").maybeSingle();
  const recMode = rec ? (rec.livemode ? "live" : "test") : "absent";
  out(recMode === mode ? "PASS" : (mode === "live" ? "FAIL" : "WARN"), "platform mode record (production boot writes it)", `${recMode}${rec ? ` · ${rec.source} · ${rec.updated_at}` : ""}${recMode !== mode && mode === "live" ? " — redeploy production, or run scripts/stripe/set-db-mode.mjs" : ""}`);
  // Accounts that this mode would use: connect rows of this mode that look ready.
  const { data: rowsNow } = await db.from("connect_accounts").select("workspace_id,stripe_account_id,charges_enabled,card_payments_capability,disabled_reason,livemode").eq("livemode", mode === "live").eq("charges_enabled", true);
  const isFake = r => /^acct_test/.test(r.stripe_account_id);
  const used = (rowsNow ?? []).sort((a, b) => Number(isFake(a)) - Number(isFake(b)));   // real ids first (Stripe GETs capped at 40)
  out("INFO", `connected accounts readiness would use (${mode})`, `${used.length} ready-looking rows`);
  let missingAcct = 0, fake = 0, stale = 0, realReady = 0;
  fake = used.filter(isFake).length;
  for (const r of used.filter(r => !isFake(r)).slice(0, 40)) {   // seeded/fixture ids (never real Stripe accounts)
    const a = await get(`accounts/${encodeURIComponent(r.stripe_account_id)}`);
    if (!a.ok) { missingAcct++; continue; }
    // The DB snapshot says ready; Stripe must agree (a stale/seeded snapshot sends buyers to a checkout Stripe will refuse).
    if (a.body.charges_enabled && a.body.capabilities?.card_payments === "active") realReady++; else stale++;
  }
  out(stale ? "FAIL" : "PASS", `DB "ready" snapshots agree with Stripe (${mode})`, `${realReady} really ready, ${stale} stale (DB says ready, Stripe says charges/card_payments not active)`);
  if (mode === "live") {
    const { count: wrong } = await db.from("connect_accounts").select("workspace_id", { count: "exact", head: true }).eq("livemode", true).like("stripe_account_id", "acct_test%");
    out(!wrong && !missingAcct && !fake ? "PASS" : "FAIL", "no test account ids would be used in live", `fixture ids: ${fake + (wrong ?? 0)}, not found in live: ${missingAcct}`);
    const { count: testRows } = await db.from("connect_accounts").select("workspace_id", { count: "exact", head: true }).eq("livemode", false);
    out("INFO", "test-mode connect rows ignored in live", `${testRows ?? 0} (readiness shows "set up payouts" for these sellers until they onboard in live)`);
  } else {
    out(realReady ? "PASS" : "FAIL", "at least one seller can take a real test charge (full test journey)", `${realReady} ready in Stripe, ${fake} seeded acct_test_* fixtures (cannot take a real test charge), ${missingAcct} not found`);
    const { count: liveRows } = await db.from("connect_accounts").select("workspace_id", { count: "exact", head: true }).eq("livemode", true);
    out(!liveRows ? "PASS" : "WARN", "no live account ids would be used in test", `${liveRows ?? 0} live rows (ignored in test)`);
  }
  const { count: liveMoney } = await db.from("webhook_events").select("id", { count: "exact", head: true }).eq("livemode", true);
  out("INFO", "live webhook events recorded so far", String(liveMoney ?? 0));
}
// 6. platform plan billing gate
out("INFO", "platform plan billing", `runs in ${mode} mode with the ${mode === "live" ? "stripe_price_live" : "stripe_price_test"} prices (unmapped → "isn't set up for billing yet")`);

const fails = results.filter(r => r.status === "FAIL").length, warns = results.filter(r => r.status === "WARN").length;
console.log(`\nSUMMARY mode=${mode} · ${results.filter(r => r.status === "PASS").length} PASS · ${fails} FAIL · ${warns} WARN`);
process.exit(fails ? 1 : 0);
