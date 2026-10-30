// Live-mode catalogue (lane A2): maps every Stripe object id Gala Dock stores (plan prices/products in public.plan_prices, AI credit-pack
// prices in public.credit_packs) from its TEST id to a LIVE equivalent, matched by lookup_key (gd_<kind>_<plan>_<interval>, gd_pack_<name>,
// the same keys scripts/billing/stripe-test-catalogue.mjs uses in test mode).
//
// DRY RUN unless --apply. Dry run: reads the database (and, only if a LIVE key is present, GETs live prices by lookup_key) and writes the
// mapping file scripts/stripe/live-price-map.json (no Stripe write, no DB write). --apply (owner only, with the live key): creates
// missing live products/prices (tax_behavior=exclusive, same amounts), then stores stripe_product_live / stripe_price_live.
//   dry run:  node --env-file=.env --env-file=.env.local scripts/stripe/live-catalogue.mjs
//   apply:    NODE_ENV=production node --env-file=.env.production.local scripts/stripe/live-catalogue.mjs --apply
// Never prints a key. Refuses --apply unless the platform key is an sk_live_/rk_live_ key and every returned object has livemode=true.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MAP = "scripts/stripe/live-price-map.json";
const apply = process.argv.includes("--apply");
const env = process.env;
const key = env.STRIPE_CONNECT_SECRET_KEY || (env.NODE_ENV !== "production" ? env.STRIPE_SECRET_KEY_SANDBOX : undefined);
const live = /^(sk|rk)_live_/.test(key ?? "");
if (apply && !live) { console.error("refusing --apply: the platform key is not a live key"); process.exit(1); }

async function stripeLive(method, path, params = {}, idem) {
  if (!live) throw new Error("no live key");
  if (method !== "GET" && !apply) throw new Error("refusing write in dry run");
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && [...body].length ? `?${body}` : ""}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `stripe_${res.status}`);
  if (data.object && !["list", "search_result", "account"].includes(data.object) && data.livemode !== true) throw new Error("refusing: non-live object returned");
  if (Array.isArray(data.data) && data.data.some(o => o.livemode === false)) throw new Error("refusing: non-live object in list");
  return data;
}

// The account the live catalogue belongs to (owner rotated 2026-10-29). --apply refuses any other account.
const EXPECTED_LIVE_ACCOUNT = "acct_1UW16CArv3W3VbtP";
if (live) {
  const acct = await stripeLive("GET", "account");
  if (acct.id !== EXPECTED_LIVE_ACCOUNT) { console.error(`refusing: live key belongs to ${acct.id}, expected ${EXPECTED_LIVE_ACCOUNT}`); process.exit(1); }
  console.log(`live account ${acct.id} (${acct.business_profile?.name ?? acct.settings?.dashboard?.display_name ?? "?"})`);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [{ data: plans, error: pe }, { data: packs, error: ke }] = await Promise.all([
  db.from("plan_prices").select("kind,plan,billing_interval,price_minor,currency,self_serve,active,stripe_product_test,stripe_price_test,stripe_product_live,stripe_price_live").eq("active", true).eq("self_serve", true),
  db.from("credit_packs").select("id,name,credits,price_minor,currency,active,stripe_price_test,stripe_price_live"),
]);
if (pe || ke) { console.error((pe ?? ke).message); process.exit(1); }

const items = [
  ...plans.map(p => ({ table: "plan_prices", match: { kind: p.kind, plan: p.plan, billing_interval: p.billing_interval }, product_key: `gd_${p.kind}_${p.plan}`,
    product_name: `Gala Dock ${p.kind === "organizer" ? "Organizer" : "Provider"} ${p.plan[0].toUpperCase()}${p.plan.slice(1)}`, product_description: `Gala Dock ${p.kind} plan`, lookup_key: `gd_${p.kind}_${p.plan}_${p.billing_interval}`,
    amount_minor: p.price_minor, currency: p.currency, interval: p.billing_interval, test: { product: p.stripe_product_test, price: p.stripe_price_test }, live: { product: p.stripe_product_live, price: p.stripe_price_live } })),
  ...packs.map(k => ({ table: "credit_packs", match: { id: k.id }, product_key: `gd_pack_${k.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, product_name: `Gala Agent credits — ${k.name}`, product_description: `${Number(k.credits).toLocaleString("en-GB")} AI credits`,
    lookup_key: `gd_pack_${k.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, amount_minor: k.price_minor, currency: k.currency, interval: null, active: k.active,
    test: { product: null, price: k.stripe_price_test }, live: { product: null, price: k.stripe_price_live } })),
];

for (const it of items) {
  let action = it.live.price ? "mapped" : "create";
  if (live) {
    const found = (await stripeLive("GET", "prices", { "lookup_keys[]": it.lookup_key, active: "true", limit: "1" })).data?.[0];
    const same = found && found.unit_amount === it.amount_minor && found.currency === it.currency.toLowerCase() && (found.recurring?.interval ?? null) === it.interval && found.tax_behavior === "exclusive";
    if (same) { it.live.price = found.id; it.live.product = typeof found.product === "string" ? found.product : found.product?.id; action = "found"; }
    if (apply && !same) {
      const prod = (await stripeLive("GET", "products/search", { query: `metadata['gd_key']:'${it.product_key}'`, limit: "1" })).data?.[0]
        ?? await stripeLive("POST", "products", { name: it.product_name, description: it.product_description, "metadata[gd_key]": it.product_key, "metadata[source]": "gala_dock_q28" }, `gd-live-product-${it.product_key}`);
      const price = await stripeLive("POST", "prices", { product: prod.id, unit_amount: String(it.amount_minor), currency: it.currency.toLowerCase(), lookup_key: it.lookup_key,
        transfer_lookup_key: "true", tax_behavior: "exclusive", "metadata[gd_lookup]": it.lookup_key, ...(it.interval ? { "recurring[interval]": it.interval } : {}) }, `gd-live-price-${it.lookup_key}-${it.amount_minor}`);
      it.live = { product: prod.id, price: price.id }; action = "created";
    }
    if (apply && it.live.price) {
      const patch = it.table === "plan_prices" ? { stripe_product_live: it.live.product, stripe_price_live: it.live.price, updated_at: new Date().toISOString() } : { stripe_price_live: it.live.price };
      // Bounded, additive: one row by its key, and only while its live id is unset (or already this id).
      let q = db.from(it.table).update(patch); for (const [k, v] of Object.entries(it.match)) q = q.eq(k, v);
      q = q.or(`stripe_price_live.is.null,stripe_price_live.eq.${it.live.price}`);
      // update().select() returns the touched rows; `count` is not populated for updates, so count the rows returned.
      const { data, error } = await q.select("stripe_price_live"); if (error) throw new Error(error.message);
      if ((data ?? []).length !== 1) throw new Error(`mapping update touched ${(data ?? []).length} rows for ${it.lookup_key}`);
    }
  }
  it.action = action;
}

const map = { generated_at: new Date().toISOString(), mode_of_key: live ? "live" : "test (no live lookups made)", applied: apply,
  note: "test → live Stripe object mapping. Live ids are filled by --apply with the live key (owner). Hard-coded Stripe ids in src/: none.",
  items: items.map(i => ({ table: i.table, lookup_key: i.lookup_key, amount_minor: i.amount_minor, currency: i.currency, interval: i.interval, test: i.test, live: i.live, action: i.action })) };
fs.writeFileSync(MAP, JSON.stringify(map, null, 2) + "\n");
for (const i of map.items) console.log(`${i.action.padEnd(7)} ${i.lookup_key.padEnd(28)} test=${i.test.price ?? "-"} live=${i.live.price ?? "-"}`);
console.log(`${apply ? "APPLIED" : "DRY RUN"} · ${items.length} objects · mapping written to ${MAP}`);
