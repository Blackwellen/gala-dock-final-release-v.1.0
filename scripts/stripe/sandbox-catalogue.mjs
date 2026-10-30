// Sandbox (TEST MODE) catalogue for the NEW sandbox account (owner moved 2026-10-29): recreates the Gala Dock plan + AI credit-pack
// catalogue — 7 products, 11 prices — exactly like scripts/billing/stripe-test-catalogue.mjs / live-catalogue.mjs (same amounts, GBP,
// intervals, tax_behavior=exclusive, lookup_keys, metadata gd_key/gd_lookup/source=gala_dock_q28), and remaps
// public.plan_prices.stripe_price_test / stripe_product_test and public.credit_packs.stripe_price_test to the new ids.
//
// Test mode only: uses STRIPE_SECRET_KEY_SANDBOX, refuses any non-test key, any account other than EXPECTED, and any live object.
// Idempotent: prices by lookup_key, products by metadata gd_key (+ Stripe idempotency keys). DB remap is bounded per row: it only
// changes a row whose test id is still the value read at start (the old sandbox id) or already the new id.
// DRY RUN unless --apply. Prints ids only.
//   node --env-file=.env --env-file=.env.local scripts/stripe/sandbox-catalogue.mjs [--apply]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const EXPECTED = "acct_1UW176Ae36uXyrUn";
const MAP = "scripts/stripe/sandbox-price-map.json";
const apply = process.argv.includes("--apply");
const key = process.env.STRIPE_SECRET_KEY_SANDBOX ?? "";
if (!/^(sk|rk)_test_/.test(key)) { console.error("refusing: STRIPE_SECRET_KEY_SANDBOX is not a test-mode key"); process.exit(1); }

async function st(method, path, params = {}, idem) {
  if (method !== "GET" && !apply) throw new Error("refusing write in dry run");
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && [...body].length ? `?${body}` : ""}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `stripe_${res.status}`);
  if (data.livemode === true || (Array.isArray(data.data) && data.data.some(o => o.livemode === true))) throw new Error("refusing: live-mode object returned");
  return data;
}

const acct = await st("GET", "account");
if (acct.id !== EXPECTED) { console.error(`refusing: sandbox key belongs to ${acct.id}, expected ${EXPECTED}`); process.exit(1); }
console.log(`sandbox account ${acct.id}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [{ data: plans, error: pe }, { data: packs, error: ke }] = await Promise.all([
  db.from("plan_prices").select("kind,plan,billing_interval,price_minor,currency,stripe_product_test,stripe_price_test").eq("active", true).eq("self_serve", true),
  db.from("credit_packs").select("id,name,credits,price_minor,currency,stripe_price_test"),
]);
if (pe || ke) { console.error((pe ?? ke).message); process.exit(1); }
const label = s => s[0].toUpperCase() + s.slice(1);
const items = [
  ...plans.map(p => ({ table: "plan_prices", match: { kind: p.kind, plan: p.plan, billing_interval: p.billing_interval }, product_key: `gd_${p.kind}_${p.plan}`,
    product_name: `Gala Dock ${p.kind === "organizer" ? "Organizer" : "Provider"} ${label(p.plan)}`, product_description: `Gala Dock ${p.kind} plan`,
    lookup_key: `gd_${p.kind}_${p.plan}_${p.billing_interval}`, amount_minor: p.price_minor, currency: p.currency, interval: p.billing_interval,
    old: { product: p.stripe_product_test, price: p.stripe_price_test }, now: { product: null, price: null } })),
  ...packs.map(k => { const pk = `gd_pack_${k.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`; return { table: "credit_packs", match: { id: k.id }, product_key: pk,
    product_name: `Gala Agent credits — ${k.name}`, product_description: `${Number(k.credits).toLocaleString("en-GB")} AI credits`, lookup_key: pk,
    amount_minor: k.price_minor, currency: k.currency, interval: null, old: { product: null, price: k.stripe_price_test }, now: { product: null, price: null } }; }),
];

for (const it of items) {
  const found = (await st("GET", "prices", { "lookup_keys[]": it.lookup_key, active: "true", limit: "1" })).data?.[0];
  const same = found && found.unit_amount === it.amount_minor && found.currency === it.currency.toLowerCase() && (found.recurring?.interval ?? null) === it.interval && found.tax_behavior === "exclusive";
  it.action = same ? "found" : "create";
  if (same) it.now = { product: typeof found.product === "string" ? found.product : found.product?.id, price: found.id };
  if (apply && !same) {
    const prod = (await st("GET", "products/search", { query: `metadata['gd_key']:'${it.product_key}'`, limit: "1" })).data?.[0]
      ?? await st("POST", "products", { name: it.product_name, description: it.product_description, "metadata[gd_key]": it.product_key, "metadata[source]": "gala_dock_q28" }, `gd-sbx-product-${it.product_key}`);
    const price = await st("POST", "prices", { product: prod.id, unit_amount: String(it.amount_minor), currency: it.currency.toLowerCase(), lookup_key: it.lookup_key,
      transfer_lookup_key: "true", tax_behavior: "exclusive", "metadata[gd_lookup]": it.lookup_key, ...(it.interval ? { "recurring[interval]": it.interval } : {}) }, `gd-sbx-price-${it.lookup_key}-${it.amount_minor}`);
    it.now = { product: prod.id, price: price.id }; it.action = "created";
  }
  if (apply && it.now.price) {
    const patch = it.table === "plan_prices" ? { stripe_product_test: it.now.product, stripe_price_test: it.now.price, updated_at: new Date().toISOString() } : { stripe_price_test: it.now.price };
    let q = db.from(it.table).update(patch);
    for (const [k, v] of Object.entries(it.match)) q = q.eq(k, v);
    q = it.old.price ? q.or(`stripe_price_test.eq.${it.old.price},stripe_price_test.eq.${it.now.price}`) : q.is("stripe_price_test", null);
    const { error, data: touched } = await q.select("stripe_price_test"); const count = touched?.length ?? 0;
    if (error) throw new Error(error.message);
    if (count !== 1) throw new Error(`remap touched ${count} rows for ${it.lookup_key}`);
  }
}
fs.writeFileSync(MAP, JSON.stringify({ generated_at: new Date().toISOString(), account: EXPECTED, applied: apply,
  items: items.map(i => ({ table: i.table, lookup_key: i.lookup_key, amount_minor: i.amount_minor, interval: i.interval, old_sandbox: i.old, new_sandbox: i.now, action: i.action })) }, null, 2) + "\n");
for (const i of items) console.log(`${i.action.padEnd(7)} ${i.lookup_key.padEnd(28)} old=${i.old.price ?? "-"} new=${i.now.price ?? "-"} product=${i.now.product ?? "-"}`);
console.log(`${apply ? "APPLIED" : "DRY RUN"} · ${items.length} prices · mapping written to ${MAP}`);
