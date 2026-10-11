// Gives the demo "Charity Gala Dinner" quote (sent, v2) a realistic multi-line breakdown, as a venue provider would build it.
// Demo data only. Idempotent: rewrites the line items, totals and the build-item mirror of that one quote.
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-quote-lines.mjs
import { createClient } from "@supabase/supabase-js";
import { GALA_LINES } from "./seed-quote-lines.data.mjs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const ev = must(await sb.from("events").select("id").eq("name", "Charity Gala Dinner").contains("settings", { demo: true }).limit(1).maybeSingle(), "event");
if (!ev) { console.log("No demo Charity Gala Dinner — run seed-provider-admin.mjs first."); process.exit(0); }
const items = must(await sb.from("build_items").select("id,quote").eq("event_id", ev.id), "build items");
for (const bi of items) {
  const quotes = must(await sb.from("provider_quotes").select("id,version,status,reference").eq("build_item_id", bi.id).in("status", ["sent", "draft"]), "quotes");
  for (const q of quotes) {
    const lines = GALA_LINES, sub = lines.reduce((a, l) => a + l.qty * l.unit_price, 0), tax = Math.round(sub * 0.2 * 100) / 100;
    must(await sb.from("provider_quotes").update({ items: lines, subtotal: sub, tax, total: sub + tax }).eq("id", q.id), "quote");
    if (q.status === "sent") must(await sb.from("build_items").update({ amount: sub + tax, deposit: Math.round((sub + tax) * 0.3), quote: { ...(bi.quote ?? {}), quote_id: q.id, reference: q.reference, version: q.version, total: sub + tax, items: lines } }).eq("id", bi.id), "mirror");
    console.log(`${q.reference} v${q.version} (${q.status}): ${lines.length} lines, £${(sub + tax).toFixed(2)} inc. VAT`);
  }
}
