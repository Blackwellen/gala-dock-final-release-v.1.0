// Q28: creates (or finds) the Gala Dock plan and AI credit-pack Products/Prices in Stripe TEST MODE and stores their ids in
// public.plan_prices.stripe_price_test / public.credit_packs.stripe_price_test. Idempotent: prices are found by lookup_key
// (gd_<kind>_<plan>_<interval>, gd_pack_<name>) and re-created only when the amount changed (the old price is archived).
// Test mode only: scripts/lib/stripe-test-mode.mjs refuses anything but an sk_test_/rk_test_ key and any live-mode object.
// Usage: node --env-file=.env --env-file=.env.local scripts/billing/stripe-test-catalogue.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { stripeTest, testSecretKey } from "../lib/stripe-test-mode.mjs";

const dry = process.argv.includes("--dry-run");
if (!testSecretKey()) throw new Error("STRIPE_SECRET_KEY_SANDBOX is not configured");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function findPrice(lookup) {
  const r = await stripeTest("GET", "prices", { "lookup_keys[]": lookup, active: "true", limit: "1" });
  return r.data?.[0] ?? null;
}
async function ensureProduct(key, name, description) {
  const found = await stripeTest("GET", "products/search", { query: `metadata['gd_key']:'${key}'`, limit: "1" });
  if (found.data?.[0]) return found.data[0];
  return stripeTest("POST", "products", { name, description, "metadata[gd_key]": key, "metadata[source]": "gala_dock_q28" }, { idempotencyKey: `gd-product-${key}` });
}
async function ensurePrice({ lookup, product, amount, currency, interval }) {
  const cur = await findPrice(lookup);
  if (cur && cur.unit_amount === amount && cur.currency === currency.toLowerCase() && (cur.recurring?.interval ?? null) === (interval ?? null)) return { price: cur, created: false };
  if (dry) return { price: cur, created: false, wouldCreate: true };
  const params = { product: product.id, unit_amount: String(amount), currency: currency.toLowerCase(), lookup_key: lookup, transfer_lookup_key: "true", tax_behavior: "exclusive",
    "metadata[gd_lookup]": lookup, ...(interval ? { "recurring[interval]": interval } : {}) };
  const price = await stripeTest("POST", "prices", params, { idempotencyKey: `gd-price-${lookup}-${amount}` });
  if (cur) await stripeTest("POST", `prices/${cur.id}`, { active: "false" });
  return { price, created: true };
}

const out = [];
const { data: plans, error: pe } = await db.from("plan_prices").select("*").eq("active", true).eq("self_serve", true);
if (pe) throw new Error(pe.message);
for (const p of plans) {
  const key = `gd_${p.kind}_${p.plan}`;
  const product = await ensureProduct(key, `Gala Dock ${p.kind === "organizer" ? "Organizer" : "Provider"} ${p.plan[0].toUpperCase()}${p.plan.slice(1)}`, `Gala Dock ${p.kind} plan`);
  const lookup = `${key}_${p.billing_interval}`;
  const r = await ensurePrice({ lookup, product, amount: p.price_minor, currency: p.currency, interval: p.billing_interval });
  if (r.price && !dry) {
    const { error } = await db.from("plan_prices").update({ stripe_product_test: product.id, stripe_price_test: r.price.id, updated_at: new Date().toISOString() })
      .eq("kind", p.kind).eq("plan", p.plan).eq("billing_interval", p.billing_interval);
    if (error) throw new Error(error.message);
  }
  out.push({ lookup, price: r.price?.id ?? null, created: r.created, wouldCreate: !!r.wouldCreate });
}
const { data: packs, error: ke } = await db.from("credit_packs").select("id,name,credits,price_minor,currency");
if (ke) throw new Error(ke.message);
for (const k of packs) {
  const key = `gd_pack_${k.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const product = await ensureProduct(key, `Gala Agent credits — ${k.name}`, `${Number(k.credits).toLocaleString("en-GB")} AI credits`);
  const r = await ensurePrice({ lookup: key, product, amount: k.price_minor, currency: k.currency, interval: null });
  if (r.price && !dry) {
    // Only the price id column is written; the margin guard re-derives worst-case cost and never activates a pack.
    const { error } = await db.from("credit_packs").update({ stripe_price_test: r.price.id }).eq("id", k.id);
    if (error) throw new Error(error.message);
  }
  out.push({ lookup: key, price: r.price?.id ?? null, created: r.created, wouldCreate: !!r.wouldCreate });
}
console.log(JSON.stringify({ mode: "test", dryRun: dry, prices: out }, null, 1));
